/**
 * Hydration-only glue emitter (Option 1: no shared runtime, no vDOM).
 *
 * The emitted ES module ENHANCES the already-complete static HTML — it never
 * builds DOM. On load it:
 *   1. imports the component's behavior exports (`setup`, `on<Event>` …),
 *   2. calls `setup(props)` once to produce component state,
 *   3. selects the existing nodes by `data-adx-c` / `data-adx-b` (querySelector),
 *   4. attaches each `@event` to its handler (handlers receive `(state, event)`),
 *   5. provides a tiny `emit(name, detail)` that dispatches a CustomEvent on the
 *      component root — no framework, no reconciliation.
 *
 * There is deliberately NO `createElement`, no innerHTML construction of
 * content, and no vDOM diff. Bindings were resolved at build time into the HTML;
 * hydration only wires interactivity.
 */

import type { BindingHook } from "./html.js";
import type { CodegenContext } from "./context.js";

/**
 * Emit the hydration ES module.
 *
 * @param hooks  ordered binding hooks from {@link emitHtml} (same ids as HTML)
 * @param ctx    codegen context (scope id, behavior api, props)
 */
export function emitGlue(hooks: BindingHook[], ctx: CodegenContext): string {
  const handlers = Array.from(
    new Set(
      hooks.flatMap((h) => h.events.map((e) => e.handler)),
    ),
  ).sort();

  const importLine =
    handlers.length > 0
      ? `import { setup, ${handlers.join(", ")} } from "./behavior.js";`
      : `import { setup } from "./behavior.js";`;

  // The EXACT merged props the HTML was built from (manifest defaults ⊕
  // --data/page data), so the browser's `setup(props)` reproduces build-time
  // state and first paint matches the crawled HTML. The host can still override
  // by setting `globalThis.__ADX_PROPS__["<ComponentName>"]` before load.
  const propsJson = JSON.stringify(buildProps(ctx), null, 2);

  const wiring = hooks
    .filter((h) => h.events.length > 0)
    .map((h) => wireHook(h))
    .join("\n");

  return `${importLine}

// Hydration-only glue for ${ctx.componentName}. Content is already in the HTML;
// this module attaches interactivity to the existing DOM. No vDOM, no runtime.

const SCOPE = ${JSON.stringify(ctx.scopeId)};
const root = document.querySelector('[data-adx-c="' + SCOPE + '"]');

const overrides = (globalThis.__ADX_PROPS__ || {})[${JSON.stringify(
    ctx.componentName,
  )}] || {};
const props = Object.assign(${propsJson}, overrides);

// Behavior handlers call a free \`emit(name, detail)\`; expose it before setup so
// imported handlers resolve it. It dispatches a bubbling CustomEvent on root.
globalThis.emit = function emit(name, detail) {
  if (!root) return;
  root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));
};

const state = setup(props);

function byHook(id) {
  return document.querySelector('[data-adx-b="' + id + '"]');
}

if (root) {
${wiring || "  // No event bindings to wire."}
}

export { state, props };
`;
}

/** Emit the event-wiring statements for one hooked node. */
function wireHook(hook: BindingHook): string {
  const lines: string[] = [];
  lines.push(`  {`);
  lines.push(`    const el = byHook(${JSON.stringify(hook.id)});`);
  lines.push(`    if (el) {`);
  for (const e of hook.events) {
    lines.push(
      `      el.addEventListener(${JSON.stringify(e.event)}, (event) => ${e.handler}(state, event));`,
    );
  }
  lines.push(`    }`);
  lines.push(`  }`);
  return lines.join("\n");
}

/** The merged props the HTML was built from (not recomputed defaults). */
function buildProps(ctx: CodegenContext): Record<string, unknown> {
  return ctx.mergedProps;
}
