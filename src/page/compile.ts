/**
 * Page compiler — composes component instances into one complete, crawlable
 * `index.html` per page.
 *
 * `compilePage(pageManifestPath, opts)` loads+validates the page manifest, then
 * for each `components[i]` compiles it through the SHARED single-component path
 * (`compileInstance`) with the instance `data` as props (source `"page"`) and a
 * stable repo-relative scopeLocation. It concatenates the component bodies in
 * DOM order inside one `<main>`, unions per-component CSS deduped by resolved
 * absolute dir, and emits one glue module per DISTINCT component (carrying an
 * INSTANCES array) plus a tiny page entry importing each component's module.
 *
 * The document is built by {@link wrapPageDocument} from the page's own SEO
 * fields (per-page lang/canonical/title/description/OG/Twitter + schema-gated
 * JSON-LD) — not from any single component's manifest.
 */

import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { adxFileError } from "../errors.js";
import { escapeHtml, indentBlock, compileInstance, serializeScriptJson } from "../compile.js";
import { createBuild } from "../codegen/compose.js";
import { emitComponentAssets, type ComponentAsset } from "../codegen/glue.js";
import { repoRoot, scopeLocation } from "../codegen/scope-location.js";
import { loadPage } from "./load.js";
import { loadSite } from "./site.js";
import type { PageAssets, PageManifest } from "./types.js";

/** Options for {@link compilePage}. */
export interface CompilePageOptions {
  /** Path to the design-tokens JSON (forwarded to each component compile). */
  tokensPath?: string;
  /**
   * Path to a site config (the `--site` flag), resolved against CWD by the
   * caller. When set, its `assets` are merged ahead of the page's own assets
   * and its `lang` fills in when the page omits `lang`. No implicit discovery.
   */
  sitePath?: string;
}

/** One used component on the page: its output filename stem + behavior src. */
export type PageComponentAsset = ComponentAsset;

/** The compiled page: a full document plus the assets written beside it. */
export interface CompiledPage {
  /** The validated page manifest (so the CLI can derive the output path). */
  page: PageManifest;
  /** The complete `index.html` document (zero `{{`). */
  html: string;
  /** The merged, scoped CSS for every distinct component (deduped). */
  css: string;
  /** The page entry module importing each component's hydration module. */
  glue: string;
  /** One asset per DISTINCT component used on the page. */
  components: PageComponentAsset[];
}

/**
 * Validate a page manifest and every component instance it uses without
 * writing anything. Runs the SAME required-prop validation per instance (via
 * the shared single-component path), so a page is only "checkable" when every
 * instance is fully supplied. Throws the first `[ADX] ...` error on failure.
 */
export function checkPage(
  pageManifestPath: string,
  opts: CompilePageOptions = {},
): void {
  compilePage(pageManifestPath, opts);
}

/** Compile a page manifest into a complete document + its sidecar assets. */
export function compilePage(
  pageManifestPath: string,
  opts: CompilePageOptions = {},
): CompiledPage {
  const page = loadPage(pageManifestPath);
  const pageFile = pageManifestPath;
  const pageDir = dirname(resolve(pageManifestPath));
  const root = repoRoot(pageDir);

  // ONE shared build so instance ordinals, composed-child dedupe and cycle
  // detection are unique across the whole page.
  const build = createBuild({ repoRoot: root, tokensPath: opts.tokensPath });

  const bodies: string[] = [];

  for (const entry of page.components) {
    const absDir = resolveUse(pageDir, entry.use, pageFile);
    const location = scopeLocation(root, absDir);
    const inst = compileInstance(absDir, {
      tokensPath: opts.tokensPath,
      data: entry.data,
      propSource: "page",
      scopeLocation: location,
      build,
    });

    bodies.push(inst.body);

    // Register the top-level component as a distinct component in the SAME
    // build table used by composed children, so one glue module per distinct
    // component covers every instance on the page (top-level + composed).
    let distinct = build.distinct.get(absDir);
    if (!distinct) {
      distinct = {
        absDir,
        scopeId: inst.scopeId,
        componentName: inst.manifest.name,
        // `inst.css` is this component's OWN css only (a shared build was
        // passed, so children are deduped separately in `build.distinct`).
        css: inst.css,
        hooks: inst.hooks,
        instances: [],
      };
      build.distinct.set(absDir, distinct);
      build.order.push(absDir);
    }
    distinct.instances.push({
      instanceIndex: inst.ctx.instanceIndex,
      props: inst.mergedProps,
      hooks: inst.hooks,
    });
  }

  // Union per-DISTINCT-component CSS (deduped by absolute dir), in discovery
  // order (top-level and composed interleave as encountered).
  const css = build.order
    .map((d) => build.distinct.get(d)!.css)
    .join("\n");

  const components = emitComponentAssets(build);

  // The page entry imports each distinct component's hydration module so a
  // single <script type="module" src="glue.js"> wires the whole page.
  const glue = emitPageEntry(components);

  // Site config is loaded ONLY when --site was passed (no implicit discovery),
  // so a build with no --site is byte-for-byte as before. The site assets are
  // the merge base (emitted first); the page's own assets are appended.
  const site = opts.sitePath ? loadSite(resolve(opts.sitePath)) : undefined;
  const mergedAssets = mergeAssets(site?.assets, page.assets);
  // A site `lang` default fills in only when the page did not explicitly set
  // one; `page.lang` is already defaulted to "en" by the loader, so it is the
  // safe final fallback when there is no site config or the site omits `lang`.
  const effectiveLang = page.langExplicit
    ? page.lang
    : (site?.lang ?? page.lang);

  const html = wrapPageDocument(
    bodies,
    { ...page, lang: effectiveLang },
    mergedAssets,
  );

  return { page, html, css, glue, components };
}

/**
 * Merge site `assets` (base) with page `assets` (appended), per field:
 * `css` concatenates then dedupes by exact string (first wins, site-ordered);
 * `js` concatenates then dedupes by `src` (first wins — a script loads once and
 * its site-level flags are the shared intent); `head` concatenates with NO
 * dedupe (raw strings; equality is ambiguous and a repeat is the author's
 * choice). A missing side is treated as empty arrays. Pure + total on validated
 * input — never throws — so `compilePage` and `checkPage` see identical output.
 */
export function mergeAssets(
  site: PageAssets | undefined,
  page: PageAssets | undefined,
): PageAssets {
  const css = dedupeStrings([...(site?.css ?? []), ...(page?.css ?? [])]);
  const js = dedupeBySrc([...(site?.js ?? []), ...(page?.js ?? [])]);
  const head = [...(site?.head ?? []), ...(page?.head ?? [])];
  return { css, js, head };
}

/** Dedupe a string list by exact value, keeping first occurrence. */
function dedupeStrings(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of list) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/** Dedupe script entries by `src` (exact), keeping first occurrence. */
function dedupeBySrc(list: PageAssets["js"]): PageAssets["js"] {
  const seen = new Set<string>();
  const out: PageAssets["js"] = [];
  for (const entry of list) {
    if (!seen.has(entry.src)) {
      seen.add(entry.src);
      out.push(entry);
    }
  }
  return out;
}

/**
 * Resolve a component instance's `use` to an absolute component directory,
 * relative to the page manifest's own directory. A target that is a `.json`
 * file or a directory lacking `manifest.json` is a fatal "Component not found".
 */
function resolveUse(pageDir: string, use: string, pageFile: string): string {
  const absDir = resolve(pageDir, use);
  if (use.endsWith(".json") || !existsSync(resolve(absDir, "manifest.json"))) {
    throw adxFileError(pageFile, `Component not found: "${use}"`);
  }
  return absDir;
}

/**
 * Build a complete HTML document from the page's own SEO fields. Emits the
 * page `lang` on `<html>`, per-page title/description/canonical/OG/Twitter, and
 * a schema-gated JSON-LD block (only when `page.schema` is present) whose
 * `@type` is the page schema and `name` is the page title.
 */
export function wrapPageDocument(
  bodies: string[],
  page: PageManifest,
  assets?: PageAssets,
): string {
  const title = escapeHtml(page.title);
  const description = escapeHtml(page.description);
  const lang = escapeHtml(page.lang);
  const canonical = escapeHtml(page.canonical);

  const og = [
    `  <meta property="og:title" content="${title}" />`,
    `  <meta property="og:description" content="${description}" />`,
    `  <meta property="og:type" content="website" />`,
    `  <meta name="twitter:card" content="summary" />`,
    `  <meta name="twitter:title" content="${title}" />`,
    `  <meta name="twitter:description" content="${description}" />`,
  ].join("\n");

  const jsonLd = page.schema
    ? `\n  <script type="application/ld+json">${serializeScriptJson({
        "@context": "https://schema.org",
        "@type": page.schema,
        name: page.title,
      })}</script>`
    : "";

  const body = indentBlock(bodies.join("\n"), 4);

  // Assets splice in at fixed seams ONLY when their array is non-empty, so an
  // absent/empty `assets` yields byte-for-byte today's document. Each fragment
  // carries its own leading `\n  ` so an empty array contributes nothing.
  // Link order alone does not override cascade layers or scoped specificity.
  const cssLinks = (assets?.css ?? [])
    .map((href) => `\n  <link rel="stylesheet" href="${escapeHtml(href)}" />`)
    .join("");
  // Raw head snippets are author-trusted: emitted verbatim (NOT escaped); the
  // leading `\n  ` is layout indentation only.
  const rawHead = (assets?.head ?? []).map((raw) => `\n  ${raw}`).join("");
  // Author scripts are emitted in document order AFTER the hydration glue, so
  // they can never appear before ADX's own module in the markup. This is a
  // MARKUP-ORDER guarantee, not a runtime one: the glue is a deferred
  // `type="module"` script, so a classic author script (shorthand → no
  // `type`/`defer`) still runs when the parser reaches it — before the deferred
  // glue executes — and an `async` entry is unordered. Code that depends on a
  // hydrated DOM must wait for a readiness signal (e.g. `type="module"`/`defer`
  // or `DOMContentLoaded`); it must not assume the glue has already run.
  const jsScripts = (assets?.js ?? []).map(scriptTag).join("");

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonical}" />
${og}${jsonLd}
  <link rel="stylesheet" href="style.css" />${cssLinks}${rawHead}
</head>
<body>
  <main>
${body}
  </main>
  <script type="module" src="glue.js"></script>${jsScripts}
</body>
</html>
`;
}

/**
 * Serialize one `assets.js` entry to its own `<script>` line. Attribute order
 * is fixed: `type` (if present), `src`, `defer` (if true), `async` (if true).
 * `src`/`type` are escaped as attribute values; `defer`/`async` are bare
 * boolean attributes. The leading `\n  ` places it on its own indented line.
 */
function scriptTag(script: PageAssets["js"][number]): string {
  const type =
    script.type !== undefined ? ` type="${escapeHtml(script.type)}"` : "";
  const defer = script.defer ? " defer" : "";
  const async = script.async ? " async" : "";
  return `\n  <script${type} src="${escapeHtml(script.src)}"${defer}${async}></script>`;
}

/** Emit the tiny page entry module importing each component's hydration. */
function emitPageEntry(components: PageComponentAsset[]): string {
  const imports = components
    .map((c) => `import "./${c.stem}.glue.js";`)
    .join("\n");
  return `// Page entry: hydrate every component used on this page.
${imports}
`;
}
