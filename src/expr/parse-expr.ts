/**
 * Restricted expression sub-parser (docs/adx-grammar.md section 5).
 *
 * Supported grammar — deliberately tiny so evaluation is a safe property walk,
 * never a JS `eval`:
 *   expr   := ident ("." ident)*
 *   ident  := [A-Za-z_$][A-Za-z0-9_$]*
 *
 * Anything else (indexing, calls, operators, literals) is unsupported and
 * surfaces as `Unsupported expression "<raw>"`.
 */

import type { Expr } from "../structure/ast.js";
import { adxError } from "../errors.js";

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;

/**
 * Parse a raw expression string into an {@link Expr}.
 *
 * @param raw  the trimmed expression text (without surrounding `{{ }}`)
 * @param file source file name for error attribution
 * @param line 1-based line of the expression for error attribution
 */
export function parseExpr(raw: string, file: string, line: number): Expr {
  const src = raw.trim();
  if (src.length === 0) {
    throw unsupported(raw, file, line);
  }

  let pos = 0;

  const readIdent = (): string | null => {
    const start = pos;
    if (pos >= src.length || !IDENT_START.test(src[pos])) {
      return null;
    }
    pos++;
    while (pos < src.length && IDENT_PART.test(src[pos])) {
      pos++;
    }
    return src.slice(start, pos);
  };

  const first = readIdent();
  if (first === null) {
    throw unsupported(raw, file, line);
  }

  let expr: Expr = { kind: "ident", name: first };

  while (pos < src.length) {
    if (src[pos] !== ".") {
      throw unsupported(raw, file, line);
    }
    pos++; // consume "."
    const prop = readIdent();
    if (prop === null) {
      throw unsupported(raw, file, line);
    }
    expr = { kind: "member", object: expr, property: prop };
  }

  return expr;
}

function unsupported(raw: string, file: string, line: number) {
  return adxError(file, line, `Unsupported expression "${raw.trim()}"`);
}
