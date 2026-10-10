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
import type { BindingHook, HtmlEmitResult } from "./html.js";
import type { ElementNode } from "../structure/ast.js";

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
  /**
   * The merged props (manifest defaults ⊕ `--data`/page data) the HTML was
   * built from. The glue bakes this exact object so the browser's
   * `setup(props)` reproduces the build-time state (hydration parity).
   */
  mergedProps: Record<string, unknown>;
  /**
   * The per-instance ordinal of THIS emission (`0` -> `data-adx-i="i0"`). Every
   * owned top-level element and every `data-adx-b` hook of this emit carries
   * this ordinal, so N instances of the same component stay independent. The
   * single-component build is always `i0`.
   */
  instanceIndex: number;
  /** The resolved ABSOLUTE directory of this component (dedupe/cycle key). */
  absDir: string;
}

/** One emitted instance of a distinct component, recorded for the glue. */
export interface InstanceRecord {
  /** The per-instance ordinal (`data-adx-i="i<instanceIndex>"`). */
  instanceIndex: number;
  /** The exact merged props the instance's HTML was built from. */
  props: Record<string, unknown>;
}

/** Everything the glue emitter needs about one DISTINCT component on a page. */
export interface DistinctComponent {
  /** Resolved absolute directory (dedupe key). */
  absDir: string;
  /** The component's shared scope id (one per distinct component). */
  scopeId: string;
  /** The component name (used to key `globalThis.__ADX_PROPS__`). */
  componentName: string;
  /** The component's scoped CSS, emitted once. */
  css: string;
  /**
   * The hooks of the FIRST emitted instance, with their ids templated so the
   * per-instance glue can substitute each instance's ordinal. Hook structure
   * (events/bindings) is identical across instances; only the `i<ordinal>`
   * segment varies, so storing one templated set is enough.
   */
  hooks: BindingHook[];
  /** One record per emitted instance of this component on the page. */
  instances: InstanceRecord[];
}

/**
 * The page-global build accumulator. One per top-level build (a single
 * component build has exactly one instance, `i0`). It owns the monotonic
 * instance-ordinal counter, the distinct-component table (deduped by absolute
 * dir — CSS/glue emitted once per component), the cycle-detection stack, and
 * the composer entry point the HTML emitter calls when it hits a custom tag.
 */
export interface BuildState {
  /** Monotonic per-instance ordinal, unique across the whole page. */
  nextInstanceIndex: number;
  /** Distinct components keyed by resolved absolute dir (insertion-ordered). */
  distinct: Map<string, DistinctComponent>;
  /** Insertion order of distinct components (for stable CSS/glue ordering). */
  order: string[];
  /** Absolute dirs currently on the compilation stack (cycle detection). */
  cycleStack: string[];
  /** Repo root used to compute stable repo-relative child scope ids. */
  repoRoot: string;
  /** The tokens path forwarded to recursively compiled children. */
  tokensPath?: string;
  /**
   * Compose a resolved custom-tag element into its child instance's markup,
   * returning the spliced HTML. Set by the compose layer; the HTML emitter
   * calls it so `html.ts` need not statically depend on the compile pipeline.
   */
  compose: (
    element: ElementNode,
    parentCtx: CodegenContext,
    parentScope: EvalScope,
    emitParent: EmitParent,
  ) => string;
}

/**
 * A callback the composer uses to emit PARENT-owned projected slot nodes at the
 * child's `<slot>` position: it re-enters the parent's emit pass (same ctx,
 * same instanceIndex, same shared binding counter) so projected nodes carry the
 * parent's scope id / instance ordinal / hook ids.
 */
export type EmitParent = (
  nodes: import("../structure/ast.js").Node[],
  scope: EvalScope,
) => HtmlEmitResult;
