/**
 * CSS transform (`.style.adx.css` -> plain scoped CSS).
 *
 * Responsibilities:
 *   1. Strip the leading `@use tokens;` pragma.
 *   2. Expand ADX abbreviated properties (pad, bg, radius, size, weight, …) to
 *      their standard CSS property names.
 *   3. Resolve every `tokens.<name>` reference to its design-token value.
 *   4. Scope each rule selector with `[data-adx-c="<id>"]` so styles only match
 *      the component's own elements.
 *   5. Pass `@media` blocks through, resolving `tokens.breakpoint-*` inside the
 *      media condition and scoping the rules within.
 *
 * An unknown token throws the EXACT contract error:
 *   `[ADX] style.adx.css:<line> - Unknown token "tokens.space-5" (available: 0,1,2,3,4,6,8,12,16)`
 *
 * The walk tracks ABSOLUTE source offsets throughout so the `<line>` in that
 * error is always the real source line, including inside `@media` blocks.
 */

import { adxError } from "../errors.js";
import type { CodegenContext } from "./context.js";

const FILE = "style.adx.css";

/**
 * ADX abbreviated property -> standard CSS property. Properties not listed are
 * emitted verbatim (e.g. `display`, `gap`, `margin`, `color`, `flex`).
 */
const PROP_ALIASES: Record<string, string> = {
  pad: "padding",
  bg: "background",
  radius: "border-radius",
  size: "font-size",
  weight: "font-weight",
  shadow: "box-shadow",
  // Documented layout/visual/typography shorthands.
  w: "width",
  h: "height",
  font: "font-family",
  leading: "line-height",
  tracking: "letter-spacing",
};

const TOKEN_RE = /tokens\.[A-Za-z0-9_-]+/g;

/** Transform `.style.adx.css` source into scoped, token-resolved plain CSS. */
export function transformCss(src: string, ctx: CodegenContext): string {
  const scopeSel = `[data-adx-c="${ctx.scopeId}"]`;
  const lineOf = lineCounter(src);
  const out: string[] = [];

  let i = 0;
  const n = src.length;

  while (i < n) {
    while (i < n && /\s/.test(src[i])) i++;
    if (i >= n) break;

    // `@use tokens;` — strip.
    if (src.startsWith("@use", i)) {
      const semi = src.indexOf(";", i);
      i = semi === -1 ? n : semi + 1;
      continue;
    }

    // `@media ... { ... }` — resolve condition tokens, scope inner rules.
    if (src.startsWith("@media", i)) {
      const braceStart = src.indexOf("{", i);
      if (braceStart === -1) break;
      const condStart = i + "@media".length;
      const condition = src.slice(condStart, braceStart);
      const bodyEnd = matchBrace(src, braceStart);
      const resolvedCond = resolveTokens(
        condition,
        condStart,
        ctx,
        lineOf,
      ).trim();
      const inner = transformRules(
        src,
        braceStart + 1,
        bodyEnd,
        scopeSel,
        ctx,
        lineOf,
      );
      out.push(`@media ${resolvedCond} {\n${indent(inner)}\n}`);
      i = bodyEnd + 1;
      continue;
    }

    // A normal rule: selector `{` declarations `}`.
    const braceStart = src.indexOf("{", i);
    if (braceStart === -1) break;
    const bodyEnd = matchBrace(src, braceStart);
    out.push(
      emitRule(src, i, braceStart, bodyEnd, scopeSel, ctx, lineOf),
    );
    i = bodyEnd + 1;
  }

  return out.join("\n\n") + "\n";
}

/** Transform the rules inside an @media block (absolute offsets preserved). */
function transformRules(
  src: string,
  start: number,
  end: number,
  scopeSel: string,
  ctx: CodegenContext,
  lineOf: (offset: number) => number,
): string {
  const out: string[] = [];
  let i = start;
  while (i < end) {
    while (i < end && /\s/.test(src[i])) i++;
    if (i >= end) break;
    const braceStart = src.indexOf("{", i);
    if (braceStart === -1 || braceStart >= end) break;
    const bodyEnd = matchBrace(src, braceStart);
    out.push(emitRule(src, i, braceStart, bodyEnd, scopeSel, ctx, lineOf));
    i = bodyEnd + 1;
  }
  return out.join("\n\n");
}

/** Emit one scoped rule with expanded props and resolved tokens. */
function emitRule(
  src: string,
  selStart: number,
  braceStart: number,
  bodyEnd: number,
  scopeSel: string,
  ctx: CodegenContext,
  lineOf: (offset: number) => number,
): string {
  const selector = src.slice(selStart, braceStart).trim();
  const scoped = scopeSelector(selector, scopeSel);

  // Walk declarations by absolute offset so token lines stay accurate.
  const bodyStart = braceStart + 1;
  const decls: string[] = [];
  let pos = bodyStart;
  while (pos < bodyEnd) {
    const semi = src.indexOf(";", pos);
    const declEnd = semi === -1 || semi > bodyEnd ? bodyEnd : semi;
    const raw = src.slice(pos, declEnd);
    if (raw.trim().length > 0) {
      decls.push(emitDeclaration(raw, pos, ctx, lineOf));
    }
    pos = declEnd + 1;
  }

  return `${scoped} {\n${indent(decls.join("\n"))}\n}`;
}

/** Expand abbreviated prop + resolve tokens in a single `prop: value` decl. */
function emitDeclaration(
  decl: string,
  declOffset: number,
  ctx: CodegenContext,
  lineOf: (offset: number) => number,
): string {
  const colon = decl.indexOf(":");
  if (colon === -1) {
    return `${decl.trim()};`;
  }
  const rawProp = decl.slice(0, colon).trim();
  const prop = PROP_ALIASES[rawProp] ?? rawProp;
  // Resolve tokens over the raw value substring, preserving absolute offsets.
  const resolved = resolveTokens(
    decl.slice(colon + 1),
    declOffset + colon + 1,
    ctx,
    lineOf,
  ).trim();
  return `${prop}: ${resolved};`;
}

/** Resolve every `tokens.<name>` in a slice, or throw the contract error. */
function resolveTokens(
  value: string,
  baseOffset: number,
  ctx: CodegenContext,
  lineOf: (offset: number) => number,
): string {
  return value.replace(TOKEN_RE, (match, offset: number) => {
    if (!ctx.tokens.has(match)) {
      const line = lineOf(baseOffset + offset);
      throw adxError(
        FILE,
        line,
        `Unknown token "${match}" (available: ${ctx.tokens.availableSpacing()})`,
      );
    }
    return ctx.tokens.resolve(match);
  });
}

/**
 * Scope each comma-separated selector with the component attribute.
 *
 * The `data-adx-c` attribute sits on every owned element, so we ATTACH the
 * attribute selector to each simple selector in the chain (Vue-scoped style):
 * `.card` -> `.card[data-adx-c="id"]`, `.card:hover` -> `.card[data-adx-c="id"]:hover`,
 * `.a .b` -> `.a[data-adx-c="id"] .b[data-adx-c="id"]`. This matches the element
 * carrying the attribute itself, unlike a descendant-combinator prefix.
 */
function scopeSelector(selector: string, scopeSel: string): string {
  const scopeAttr = scopeSel; // already `[data-adx-c="id"]`
  return selector
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((group) =>
      group
        .split(/\s+/)
        .map((part) => attachScopeToCompound(part, scopeAttr))
        .join(" "),
    )
    .join(",\n");
}

/**
 * Insert the scope attribute after the first simple selector of a compound,
 * before any pseudo-class/element. `.card:hover` -> `.card[attr]:hover`.
 */
function attachScopeToCompound(compound: string, scopeAttr: string): string {
  // Combinators like > + ~ pass through untouched.
  if (compound === ">" || compound === "+" || compound === "~") {
    return compound;
  }
  const pseudoAt = compound.search(/::?[a-zA-Z]/);
  if (pseudoAt === -1) {
    return `${compound}${scopeAttr}`;
  }
  return `${compound.slice(0, pseudoAt)}${scopeAttr}${compound.slice(pseudoAt)}`;
}

/** Return the index of the `}` matching the `{` at `open`. */
function matchBrace(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length - 1;
}

/** Indent each line of a block by two spaces. */
function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => (l.length > 0 ? "  " + l : l))
    .join("\n");
}

/** Build an offset -> 1-based line resolver over `src`. */
function lineCounter(src: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < src.length; i++) {
    if (src.charCodeAt(i) === 10) starts.push(i + 1);
  }
  return (offset: number): number => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}
