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
import { escapeHtml, indentBlock, compileInstance } from "../compile.js";
import { createBuild } from "../codegen/compose.js";
import { emitComponentGlue } from "../codegen/glue.js";
import { repoRoot, scopeLocation } from "../codegen/scope-location.js";
import { loadPage } from "./load.js";
import type { PageManifest } from "./types.js";

/** Options for {@link compilePage}. */
export interface CompilePageOptions {
  /** Path to the design-tokens JSON (forwarded to each component compile). */
  tokensPath?: string;
}

/** One used component on the page: its output filename stem + behavior src. */
export interface PageComponentAsset {
  /** Filename stem beside the page, e.g. `user-card` -> `user-card.behavior.js`. */
  stem: string;
  /** The resolved absolute component directory. */
  absDir: string;
  /** The emitted per-component glue module (imports its behavior, hydrates). */
  glue: string;
}

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
    });
  }

  // Union per-DISTINCT-component CSS (deduped by absolute dir), in discovery
  // order (top-level and composed interleave as encountered).
  const css = build.order
    .map((d) => build.distinct.get(d)!.css)
    .join("\n");

  const components: PageComponentAsset[] = build.order.map((d) => {
    const c = build.distinct.get(d)!;
    const stem = stemOf(d);
    return {
      stem,
      absDir: d,
      glue: emitComponentGlue(c, `./${stem}.behavior.js`),
    };
  });

  // The page entry imports each distinct component's hydration module so a
  // single <script type="module" src="glue.js"> wires the whole page.
  const glue = emitPageEntry(components);

  const html = wrapPageDocument(bodies, page);

  return { page, html, css, glue, components };
}

/** The output filename stem for a component (its directory basename). */
function stemOf(absDir: string): string {
  return absDir.split(/[/\\]/).filter(Boolean).pop() ?? "component";
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
export function wrapPageDocument(bodies: string[], page: PageManifest): string {
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
    ? `\n  <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": page.schema,
        name: page.title,
      })}</script>`
    : "";

  const body = indentBlock(bodies.join("\n"), 4);

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="${canonical}" />
${og}${jsonLd}
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
${body}
  </main>
  <script type="module" src="glue.js"></script>
</body>
</html>
`;
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
