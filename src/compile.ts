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
import { loadTokens } from "./tokens/load.js";
import { emitHtml } from "./codegen/html.js";
import { transformCss } from "./codegen/css.js";
import { emitGlue } from "./codegen/glue.js";
import { scopeId } from "./codegen/scope.js";
import type { CodegenContext } from "./codegen/context.js";
import type { EvalScope } from "./expr/evaluate.js";
import type { Manifest } from "./manifest/types.js";

/** Options for {@link compileComponent}. */
export interface CompileOptions {
  /** Path to the design-tokens JSON. Defaults to `../tokens/design-tokens.json`
   * relative to CWD so the CLI run from `compiler/` finds the worktree-root
   * token file. */
  tokensPath?: string;
}

/** The three emitted artifacts for a component. */
export interface CompiledComponent {
  html: string;
  css: string;
  glue: string;
  /** The manifest (so the CLI can name the output directory). */
  manifest: Manifest;
}

const DEFAULT_TOKENS = "../tokens/design-tokens.json";

/** Compile a component directory into html/css/glue artifacts. */
export function compileComponent(
  dir: string,
  opts: CompileOptions = {},
): CompiledComponent {
  const manifest = loadManifest(dir);

  const structureSrc = readFileSync(join(dir, "structure.adx"), "utf8");
  const ast = parseStructure(structureSrc, "structure.adx");

  const behaviorSrc = readFileSync(join(dir, "behavior.adx.js"), "utf8");
  const behavior = scanBehavior(behaviorSrc, "behavior.adx.js");

  const styleSrc = readFileSync(join(dir, "style.adx.css"), "utf8");

  const tokensPath = resolve(opts.tokensPath ?? DEFAULT_TOKENS);
  const tokens = loadTokens(tokensPath);

  const buildProps = defaultProps(manifest);
  const scope: EvalScope = { state: buildProps, props: buildProps };

  const ctx: CodegenContext = {
    componentName: manifest.name,
    scopeId: scopeId(manifest.name, basename(dir)),
    scope,
    tokens,
    behavior,
    manifest,
  };

  const { html, hooks } = emitHtml(ast, ctx);
  const css = transformCss(styleSrc, ctx);
  const glue = emitGlue(hooks, ctx);

  return { html: wrapDocument(html, ctx), css, glue, manifest };
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

function indentBlock(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => (l.length > 0 ? pad + l : l))
    .join("\n");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
