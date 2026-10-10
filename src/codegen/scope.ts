/**
 * Deterministic scope-id generation for CSS/HTML scoping.
 *
 * Each component gets a stable `data-adx-c="<scopeId>"` attribute. The id is a
 * short hash of the component name plus its relative directory path, so the
 * same component always compiles to the same id (reproducible builds) while two
 * differently-located components never collide.
 *
 * The id is also used to derive stable `data-adx-b="<id>-<n>"` binding hooks for
 * nodes that carry interpolations/bindings/events, which the hydration glue
 * selects by (never rebuilds the DOM).
 */

import { createHash } from "node:crypto";

/**
 * Compute a deterministic scope id from the component name and a path that
 * identifies its location (relative dir or absolute — the caller decides, as
 * long as it is stable across builds).
 *
 * Returns a 7-char lowercase base36-ish hex slice, prefixed `c` so it is a
 * valid attribute token and never starts with a digit.
 */
export function scopeId(componentName: string, locationPath: string): string {
  const hash = createHash("sha256")
    .update(`${componentName}\u0000${locationPath}`)
    .digest("hex");
  return `c${hash.slice(0, 7)}`;
}

/** Build a stable binding-hook id for the nth bound node of a component. */
export function bindingId(scope: string, index: number): string {
  return `${scope}-${index}`;
}

/**
 * Build an instance-scoped binding-hook id: `${scope}-i${instanceIndex}-${n}`.
 *
 * The `scope` segment groups a component's CSS (one `data-adx-c` per component);
 * the `i<instanceIndex>` segment disambiguates each INSTANCE of that component
 * on a page (so N instances never collide); `n` is the per-instance node index.
 * This is additive — `bindingId`/`scopeId` are unchanged. The composition/page
 * emit path uses this form so the per-instance glue can resolve each instance's
 * hooked nodes within its own root.
 */
export function instanceBindingId(
  scope: string,
  instanceIndex: number,
  n: number,
): string {
  return `${scope}-i${instanceIndex}-${n}`;
}
