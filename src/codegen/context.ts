/**
 * Shared codegen context.
 *
 * Carries everything the three emitters (html/css/glue) need: the deterministic
 * scope id, the build-time evaluation scope (state/props/computed), the token
 * table, and the behavior API surface. The HTML emitter also tracks a binding
 * counter so every bound node gets a stable `data-adx-b` hook the glue reuses.
 */

import type { EvalScope } from "../expr/evaluate.js";
import type { TokenTable } from "../tokens/types.js";
import type { BehaviorApi } from "../behavior/types.js";
import type { Manifest } from "../manifest/types.js";

export interface CodegenContext {
  /** Component name (from manifest). */
  componentName: string;
  /** Deterministic scope id, e.g. `c1a2b3c`. */
  scopeId: string;
  /** Build-time evaluation scope (manifest-default props as state + props). */
  scope: EvalScope;
  /** Resolved design tokens. */
  tokens: TokenTable;
  /** Scanned behavior exports. */
  behavior: BehaviorApi;
  /** The validated manifest. */
  manifest: Manifest;
}
