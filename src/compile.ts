/**
 * End-to-end component compiler.
 *
 * `compileComponent(dir, opts)` runs the full pipeline for one component
 * directory and returns the three artifacts (html/css/glue). `checkComponent`
 * runs the same analysis + emission to surface any error, but returns nothing
 * (it writes nothing either — the CLI is responsible for I/O).
 *
 * Pipeline: manifest -> structure parse -> behavior scan -> tokens -> emit.
 * The build-time evaluation scope is derived from manifest prop defaults (both
 * `state` and `props`), which is enough to resolve the documented examples at
 * build time while keeping the compiler pure (we never execute `setup`).
 */

import { readFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { loadManifest } from "./manifest/load.js";
import { parseStructure } from "./structure/parser.js";
import { scanBehavior } from "./behavior/scan.js";
import { runSetup } from "./behavior/run.js";
import { loadTokens } from "./tokens/load.js";
import { emitHtml } from "./codegen/html.js";
import { transformCss } from "./codegen/css.js";
import { emitGlue } from "./codegen/glue.js";
import { scopeId } from "./codegen/scope.js";
import { createBuild } from "./codegen/compose.js";
import { repoRoot } from "./codegen/scope-location.js";
import { adxFileError } from "./errors.js";
import type { CodegenContext, BuildState } from "./codegen/context.js";
import type { EvalScope } from "./expr/evaluate.js";
import type { Manifest } from "./manifest/types.js";

/** Options for {@link compileComponent}. */
export interface CompileOptions {
  /** Path to the design-tokens JSON. Defaults to `tokens/design-tokens.json`
   * relative to CWD, i.e. the repo root where the token file lives. */
  tokensPath?: string;
  /** Parsed `--data` JSON: the props object overlaid on manifest defaults. */
  data?: Record<string, unknown>;
  /**
   * The location string handed to `scopeId`. The single-component M1 path uses
   * `basename(dir)`; the page/composed paths pass a stable repo-relative,
   * POSIX-normalized path (see {@link scopeLocation}) so ids are identical
   * across machines. Internal — set by `compilePage`.
   */
  scopeLocation?: string;
  /**
   * Which prop source selects the required-prop hint. Defaults to
   * `"standalone"`; `compilePage` passes `"page"`. Internal.
   */
  propSource?: PropSource;
  /**
   * A SHARED page-global build accumulator so instance ordinals, composed-child
   * dedupe, and cycle detection are unique across a whole page. Set by
   * `compilePage`; the single-component path creates its own when omitted.
   * Internal.
   */
  build?: BuildState;
}

/**
 * A component compiled as part of a larger build (page/composition): the raw
 * body HTML (NOT wrapped in a document), its scoped CSS, the glue, the ordered
 * binding hooks, and enough identity to dedupe/compose.
 */
export interface CompiledInstance {
  /** The component body markup (no `<!DOCTYPE>`/`<head>`/`<main>` wrapper). */
  body: string;
  css: string;
  glue: string;
  hooks: import("./codegen/html.js").BindingHook[];
  manifest: Manifest;
  /** The deterministic scope id (shared across instances of a component). */
  scopeId: string;
  /** The resolved absolute component directory (dedupe key). */
  absDir: string;
  /** The exact merged props the body was built from. */
  mergedProps: Record<string, unknown>;
}

/** Where a component's props come from — selects the required-prop hint. */
export type PropSource = "standalone" | "page" | "composed";

/** The three emitted artifacts for a component. */
export interface CompiledComponent {
  html: string;
  css: string;
  glue: string;
  /** The manifest (so the CLI can name the output directory). */
  manifest: Manifest;
}

const DEFAULT_TOKENS = "tokens/design-tokens.json";

/** Compile a component directory into html/css/glue artifacts. */
export function compileComponent(
  dir: string,
  opts: CompileOptions = {},
): CompiledComponent {
  const inst = compileInstance(dir, opts);
  const ctx = inst.ctx;
  return {
    html: wrapDocument(inst.body, ctx),
    css: inst.css,
    glue: inst.glue,
    manifest: inst.manifest,
  };
}

/**
 * Shared single-component path used by both the standalone build and the page
 * build. Runs manifest -> parse -> scan -> tokens -> emit for ONE instance and
 * returns the raw body (unwrapped), css, glue, hooks and identity. The caller
 * decides how to wrap/combine the body (`compileComponent` wraps it in a full
 * document; `compilePage` concatenates several bodies inside one `<main>`).
 */
export function compileInstance(
  dir: string,
  opts: CompileOptions = {},
): CompiledInstance & { ctx: CodegenContext } {
  const manifest = loadManifest(dir);

  const structureSrc = readFileSync(join(dir, "structure.adx"), "utf8");
  const ast = parseStructure(structureSrc, "structure.adx");

  const behaviorSrc = readFileSync(join(dir, "behavior.adx.js"), "utf8");
  const behavior = scanBehavior(behaviorSrc, "behavior.adx.js");

  const styleSrc = readFileSync(join(dir, "style.adx.css"), "utf8");

  const tokensPath = resolve(opts.tokensPath ?? DEFAULT_TOKENS);
  const tokens = loadTokens(tokensPath);

  // Three-layer merge (manifest defaults <- data) + required-prop validation,
  // then run setup() in the sandbox to compute true build-time state.
  const source: PropSource = opts.propSource ?? "standalone";
  const mergedProps = resolveProps(manifest, opts.data, source);
  const { state, computed } = runSetup(behaviorSrc, mergedProps, behavior);
  const scope: EvalScope = { state, props: mergedProps, computed };

  // The single-component M1 path keeps basename(dir); page/composed paths pass
  // a stable repo-relative, POSIX-normalized location (opts.scopeLocation).
  const location = opts.scopeLocation ?? basename(dir);
  const absDir = resolve(dir);

  // A build accumulator owns the page-global instance ordinal and the composed
  // child dedupe/cycle state. A build must be supplied so this instance is
  // assigned an ordinal (i0 for the single-component path). The caller
  // (`compilePage`) may pass a SHARED build so ordinals are unique across a
  // whole page; the single-component path creates its own.
  const build =
    opts.build ??
    createBuild({ repoRoot: repoRoot(absDir), tokensPath: opts.tokensPath });
  const instanceIndex = build.nextInstanceIndex++;

  const ctx: CodegenContext = {
    componentName: manifest.name,
    scopeId: scopeId(manifest.name, location),
    scope,
    tokens,
    behavior,
    manifest,
    mergedProps,
    instanceIndex,
    absDir,
  };

  // Track this component on the cycle stack while its subtree compiles so a
  // composed descendant that depends back on it is detected (chain starts at
  // the top-level component).
  build.cycleStack.push(absDir);
  const { html, hooks } = emitHtml(ast, ctx, build);
  build.cycleStack.pop();
  const ownCss = transformCss(styleSrc, ctx);
  const glue = emitGlue(hooks, ctx);

  // When this instance owns its build (the standalone path, no shared build),
  // fold any composed children's scoped CSS (deduped by abs dir) after this
  // component's own CSS so a standalone build that composes children still
  // carries their styles. When a SHARED build is passed (the page path), the
  // caller emits per-distinct-component CSS from `build.distinct`, so we return
  // only this component's OWN css to avoid double-counting.
  const sharedBuild = opts.build !== undefined;
  const childCss = sharedBuild
    ? []
    : build.order.map((d) => build.distinct.get(d)!.css);
  const css = [ownCss, ...childCss].join("\n");

  return {
    body: html,
    css,
    glue,
    hooks,
    manifest,
    scopeId: ctx.scopeId,
    absDir,
    mergedProps,
    ctx,
  };
}

/** Validate + emit a component without writing anything. Throws on error. */
export function checkComponent(dir: string, opts: CompileOptions = {}): void {
  compileComponent(dir, opts);
}

/** Build the build-time props object from manifest prop defaults. */
function defaultProps(manifest: Manifest): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [name, def] of Object.entries(manifest.props)) {
    if (def.default !== undefined) {
      props[name] = def.default;
    }
  }
  return props;
}

/**
 * Resolve the effective props for a component instance.
 *
 * Three-layer merge: manifest defaults, overlaid by supplied `data` (shallow,
 * data wins per key). Then required-prop validation: every manifest prop marked
 * `required` must have an own value (a default or a supplied one), else a
 * line-less manifest error whose parenthetical hint is branched by `source`.
 * The stem `Missing required prop "<name>" (no default and ...` is identical
 * across sources so tests can assert the stem and the branch independently.
 */
export function resolveProps(
  manifest: Manifest,
  data: Record<string, unknown> | undefined,
  source: PropSource,
): Record<string, unknown> {
  const merged: Record<string, unknown> = defaultProps(manifest);
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      merged[key] = value;
    }
  }

  for (const [name, def] of Object.entries(manifest.props)) {
    if (
      def.required &&
      !Object.prototype.hasOwnProperty.call(merged, name)
    ) {
      throw adxFileError(
        "manifest.json",
        `Missing required prop "${name}" (${requiredHint(source)})`,
      );
    }
  }

  return merged;
}

/** The source-specific parenthetical for a missing required prop. */
function requiredHint(source: PropSource): string {
  switch (source) {
    case "standalone":
      return "no default and none supplied via --data";
    case "page":
      return "no default and no value in the page's component data";
    case "composed":
      return "no default and no value passed by the parent";
  }
}

/**
 * Wrap the component markup in a complete, crawlable HTML document.
 *
 * The SEO contract requires full static content, semantic structure, correct
 * heading order, and metadata. We emit `lang`, `<title>`, description, canonical
 * and Open Graph/Twitter tags (from manifest `seo` when present), load the glue
 * as a deferred module (never blocking first paint), and keep the component
 * markup inside `<main>`.
 */
function wrapDocument(body: string, ctx: CodegenContext): string {
  const seo = ctx.manifest.seo ?? {};
  const title = escapeHtml(seo.title ?? ctx.manifest.name);
  const description = escapeHtml(
    seo.description ?? `${ctx.manifest.name} component`,
  );
  const metaDescription = `  <meta name="description" content="${description}" />`;
  const og = [
    `  <meta property="og:title" content="${title}" />`,
    `  <meta property="og:description" content="${description}" />`,
    `  <meta property="og:type" content="website" />`,
    `  <meta name="twitter:card" content="summary" />`,
    `  <meta name="twitter:title" content="${title}" />`,
    `  <meta name="twitter:description" content="${description}" />`,
  ].join("\n");

  const jsonLd = seo.schema
    ? `\n  <script type="application/ld+json">${JSON.stringify({
        "@context": "https://schema.org",
        "@type": seo.schema,
        name: ctx.manifest.name,
      })}</script>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
${metaDescription}
  <link rel="canonical" href="/" />
${og}${jsonLd}
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
${indentBlock(body, 4)}
  </main>
  <script type="module" src="glue.js"></script>
</body>
</html>
`;
}

export function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => (l.length > 0 ? pad + l : l))
    .join("\n");
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
