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
import { basename, resolve, dirname } from "node:path";
import { adxFileError } from "../errors.js";
import { escapeHtml, indentBlock, compileInstance } from "../compile.js";
import type { CompiledInstance } from "../compile.js";
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

  const bodies: string[] = [];
  // Dedupe per DISTINCT component by resolved absolute dir.
  const byDir = new Map<
    string,
    {
      stem: string;
      scopeId: string;
      componentName: string;
      css: string;
      hooks: CompiledInstance["hooks"];
      instances: Array<{ instanceIndex: number; props: Record<string, unknown> }>;
    }
  >();
  const orderOfDistinct: string[] = [];
  let instanceIndex = 0;

  for (const entry of page.components) {
    const absDir = resolveUse(pageDir, entry.use, pageFile);
    const location = scopeLocation(root, absDir);
    const inst = compileInstance(absDir, {
      tokensPath: opts.tokensPath,
      data: entry.data,
      propSource: "page",
      scopeLocation: location,
    });

    bodies.push(inst.body);

    let distinct = byDir.get(absDir);
    if (!distinct) {
      distinct = {
        stem: basename(absDir),
        scopeId: inst.scopeId,
        componentName: inst.manifest.name,
        css: inst.css,
        hooks: inst.hooks,
        instances: [],
      };
      byDir.set(absDir, distinct);
      orderOfDistinct.push(absDir);
    }
    distinct.instances.push({
      instanceIndex: instanceIndex++,
      props: inst.mergedProps,
    });
  }

  // Union per-component CSS (deduped by absolute dir -> one block per component).
  const css = orderOfDistinct.map((d) => byDir.get(d)!.css).join("\n");

  const components: PageComponentAsset[] = orderOfDistinct.map((d) => {
    const c = byDir.get(d)!;
    return {
      stem: c.stem,
      absDir: d,
      glue: emitComponentGlue(c),
    };
  });

  // The page entry imports each distinct component's hydration module so a
  // single <script type="module" src="glue.js"> wires the whole page.
  const glue = emitPageEntry(components);

  const html = wrapPageDocument(bodies, page);

  return { page, html, css, glue, components };
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

/**
 * Emit one glue module for a DISTINCT component, carrying an INSTANCES array
 * (one record per instance of that component on the page, each with its own
 * instanceIndex and merged props). The module imports the component's behavior
 * and hydrates each instance root. The per-instance root/selection mechanism is
 * finished in FEAT-003; FEAT-002 bakes the INSTANCES array and wires events on
 * the shared scope root so the module is functional.
 */
function emitComponentGlue(c: {
  stem: string;
  scopeId: string;
  componentName: string;
  hooks: CompiledInstance["hooks"];
  instances: Array<{ instanceIndex: number; props: Record<string, unknown> }>;
}): string {
  const handlers = Array.from(
    new Set(c.hooks.flatMap((h) => h.events.map((e) => e.handler))),
  ).sort();

  const importLine =
    handlers.length > 0
      ? `import { setup, ${handlers.join(", ")} } from "./${c.stem}.behavior.js";`
      : `import { setup } from "./${c.stem}.behavior.js";`;

  const instancesJson = JSON.stringify(
    c.instances.map((i) => ({ instanceIndex: i.instanceIndex, props: i.props })),
    null,
    2,
  );

  const wiring = c.hooks
    .filter((h) => h.events.length > 0)
    .map((h) => wireHook(h))
    .join("\n");

  return `${importLine}

// Per-instance hydration glue for ${c.componentName}. Content is already in the
// HTML; this module attaches interactivity to the existing DOM. No vDOM.

const SCOPE = ${JSON.stringify(c.scopeId)};
const INSTANCES = ${instancesJson};

globalThis.emit = globalThis.emit || function emit(name, detail) {
  const root = document.querySelector('[data-adx-c="' + SCOPE + '"]');
  if (!root) return;
  root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
};

function byHook(id) {
  return document.querySelector('[data-adx-b="' + id + '"]');
}

for (const instance of INSTANCES) {
  const overrides =
    (globalThis.__ADX_PROPS__ || {})[${JSON.stringify(c.componentName)}] || {};
  const props = Object.assign({}, instance.props, overrides);
  const state = setup(props);
  const root = document.querySelector('[data-adx-c="' + SCOPE + '"]');
  if (root) {
${indentBlock(wiring || "// No event bindings to wire.", 4)}
  }
}
`;
}

/** Emit the event-wiring statements for one hooked node (page glue). */
function wireHook(hook: CompiledInstance["hooks"][number]): string {
  const lines: string[] = [];
  lines.push(`{`);
  lines.push(`  const el = byHook(${JSON.stringify(hook.id)});`);
  lines.push(`  if (el) {`);
  for (const e of hook.events) {
    lines.push(
      `    el.addEventListener(${JSON.stringify(e.event)}, (event) => ${e.handler}(state, event));`,
    );
  }
  lines.push(`  }`);
  lines.push(`}`);
  return lines.join("\n");
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
