/**
 * Build-time expression evaluator.
 *
 * A SAFE property walker over the restricted ident/member grammar — never a JS
 * `eval`. Identifier resolution walks inner-to-outer (grammar section 4.3):
 *   loop scope -> setup() state -> props -> computed getXxx() results.
 * A bare computed name (`displayName`) resolves to the result of its
 * `getDisplayName` function. Unknown identifiers resolve to `undefined`.
 */

import type { Expr } from "../structure/ast.js";

/** The scope an expression is evaluated against. */
export interface EvalScope {
  /** Innermost-first loop variable frames (from enclosing `:for` elements). */
  locals?: Array<Record<string, unknown>>;
  /** The object returned by `setup(props)`. */
  state?: Record<string, unknown>;
  /** The component props. */
  props?: Record<string, unknown>;
  /**
   * Computed values keyed by their BARE name (e.g. `displayName` for the
   * `getDisplayName` export). Values may be precomputed results or thunks.
   */
  computed?: Record<string, unknown | (() => unknown)>;
}

/** Resolve an expression to its runtime value, or `undefined` if unresolved. */
export function evaluate(expr: Expr, scope: EvalScope): unknown {
  if (expr.kind === "ident") {
    return resolveIdent(expr.name, scope);
  }
  const object = evaluate(expr.object, scope);
  if (object === null || object === undefined) {
    return undefined;
  }
  return (object as Record<string, unknown>)[expr.property];
}

function resolveIdent(name: string, scope: EvalScope): unknown {
  // Loop variables, innermost frame first.
  if (scope.locals) {
    for (const frame of scope.locals) {
      if (frame && Object.prototype.hasOwnProperty.call(frame, name)) {
        return frame[name];
      }
    }
  }
  if (scope.state && Object.prototype.hasOwnProperty.call(scope.state, name)) {
    return scope.state[name];
  }
  if (scope.props && Object.prototype.hasOwnProperty.call(scope.props, name)) {
    return scope.props[name];
  }
  if (scope.computed && Object.prototype.hasOwnProperty.call(scope.computed, name)) {
    const value = scope.computed[name];
    return typeof value === "function"
      ? (value as () => unknown)()
      : value;
  }
  return undefined;
}

/**
 * Truthiness for `:if`. Mirrors JS falsy semantics: `""`, 0, null, undefined,
 * NaN and false are falsy (so an empty-string bio is falsy, per grammar 10).
 */
export function truthy(value: unknown): boolean {
  return Boolean(value);
}

/** Coerce a value to emitted text: null/undefined -> "", else String(value). */
export function toText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}
