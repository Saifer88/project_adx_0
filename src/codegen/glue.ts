/**
 * Hydration-only, PER-INSTANCE glue emitter (Option 1: no shared runtime, no
 * vDOM).
 *
 * The emitted ES module ENHANCES already-complete static HTML — it never builds
 * DOM. A component used N times on a page produces N independent runtime
 * instances. The module carries an `INSTANCES` array (one record per instance,
 * each with its own merged props) and loops: for each instance it
 *   1. selects THAT instance's root via
 *      `[data-adx-c="SCOPE"][data-adx-i="i<ordinal>"]`,
 *   2. builds its OWN `state = setup(props)` from its own props,
 *   3. builds an `emit` closure that dispatches a bubbling CustomEvent on THAT
 *      instance's root (so a parent listener sees the right instance),
 *   4. resolves its hooked nodes WITHIN its root by the instance-scoped
 *      `data-adx-b` id (`${scope}-i<ordinal>-<n>`),
 *   5. wires each `@event` as `(event) => { emit; handler(state, event);
 *      rerender(); }`.
 *
 * There is deliberately NO `createElement`, no innerHTML construction of
 * content, and no vDOM diff. Bindings were resolved at build time into the HTML;
 * hydration only wires interactivity and (per-instance) patches hooked nodes.
 */

import type { BindingHook } from "./html.js";
import type { DistinctComponent } from "./context.js";
import type { BuildState, CodegenContext } from "./context.js";
import { BOOLEAN_ATTRIBUTES } from "./html-tags.js";
import { basename } from "node:path";

export interface ComponentAsset {
  stem: string;
  absDir: string;
  glue: string;
}

export function emitComponentAssets(build: BuildState): ComponentAsset[] {
  const bases = build.order.map((dir) => basename(dir).replace(/[^a-zA-Z0-9_-]/g, "-") || "component");
  const counts = new Map<string, number>();
  for (const base of bases) counts.set(base, (counts.get(base) ?? 0) + 1);
  const used = new Set<string>();
  return build.order.map((dir, index) => {
    const component = build.distinct.get(dir)!;
    const base = bases[index];
    let stem = counts.get(base) === 1 ? base : `${base}-${component.scopeId}`;
    let suffix = 0;
    while (used.has(stem) || (stem !== base && counts.has(stem))) {
      stem = `${base}-${component.scopeId}-${++suffix}`;
    }
    used.add(stem);
    return { stem, absDir: dir, glue: emitComponentGlue(component, `./${stem}.behavior.js`) };
  });
}

/**
 * Emit the per-instance hydration ES module for one distinct component.
 *
 * The single-component build passes a {@link DistinctComponent} with one
 * instance (`i0`); the page build passes one with N instances. Behaviors are
 * imported from `importPath` (default `./behavior.js` for the single-component
 * layout; the page layout passes `./<stem>.behavior.js`).
 */
export function emitComponentGlue(
  c: DistinctComponent,
  importPath = "./behavior.js",
): string {
  const handlers = Array.from(
    new Set(c.instances.flatMap((inst) =>
      (inst.hooks ?? c.hooks).flatMap((hook) => hook.events.map((event) => event.handler)),
    )),
  ).sort();

  const importLine =
    handlers.length > 0
      ? `import { setup, ${handlers.join(", ")} } from ${JSON.stringify(importPath)};`
      : `import { setup } from ${JSON.stringify(importPath)};`;

  // The HANDLERS map lets the per-instance loop look a handler up by name.
  const handlersMap =
    handlers.length > 0
      ? `const HANDLERS = { ${handlers.map((h) => `${h}: ${h}`).join(", ")} };`
      : `const HANDLERS = {};`;

  // Hooks are stored structurally (events + updates + node index `n`); the loop
  // rebuilds each hook's instance-scoped id from SCOPE + the ordinal + `n`. A
  // hook with no events AND no updates carries nothing to wire or patch, so it
  // is dropped from the emitted array.
  const serializeHooks = (hooks: BindingHook[]) => hooks
      .filter((h) => h.events.length > 0 || h.updates.length > 0)
      .map((h) => ({
        n: h.n,
        events: h.events,
        updates: h.updates,
      }));

  const instancesJson = JSON.stringify(
    c.instances.map((inst) => ({
      i: `i${inst.instanceIndex}`,
      props: inst.props,
      hooks: serializeHooks(inst.hooks ?? c.hooks),
    })),
    null,
    2,
  );

  return `${importLine}

// Per-instance hydration glue for ${c.componentName}. Content is already in the
// HTML; this module attaches interactivity to the existing DOM. No vDOM.

const SCOPE = ${JSON.stringify(c.scopeId)};
const COMPONENT = ${JSON.stringify(c.componentName)};
const BOOLEAN_ATTRIBUTES = new Set(${JSON.stringify([...BOOLEAN_ATTRIBUTES])});

// One record per instance of this component on the page. Each record's props
// are the SAME merged props the HTML for that instance was built from, so each
// instance's browser setup() reproduces its own build-time state.
const INSTANCES = ${instancesJson};

${handlersMap}

const overrides = (globalThis.__ADX_PROPS__ || {})[COMPONENT] || {};

// Exported for tooling/tests: the LAST instance's state/props.
let lastState;
let lastProps;

for (const inst of INSTANCES) {
  // This instance's root: data-adx-c (shared) + data-adx-i (per-instance).
  const roots = Array.from(document.querySelectorAll(
    '[data-adx-c="' + SCOPE + '"][data-adx-i="' + inst.i + '"]',
  ));
  const root = roots[0];
  if (!root) continue;

  const props = Object.assign({}, inst.props, overrides);
  const state = setup(props);
  lastProps = props;
  lastState = state;

  // emit is bound to THIS instance's root so event.target ancestry is correct.
  const emit = (name, detail) =>
    root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));

  // Resolve a hooked node WITHIN this instance's root only.
  const byHook = (n) => {
    const id = SCOPE + '-' + inst.i + '-' + n;
    for (const root of roots) {
      if (root.matches('[data-adx-b="' + id + '"]')) return root;
      const found = root.querySelector('[data-adx-b="' + id + '"]');
      if (found) return found;
    }
    return null;
  };

  // Per-instance patch pass (updates land in FEAT-004; the loop is in place).
  const rerender = () => {
    for (const h of inst.hooks) {
      const el = byHook(h.n);
      if (!el) continue;
      for (const u of h.updates || []) applyUpdate(el, u, state);
    }
  };

  for (const h of inst.hooks) {
    const el = byHook(h.n);
    if (!el) continue;
    for (const ev of h.events) {
      const handler = HANDLERS[ev.handler];
      if (!handler) continue;
      el.addEventListener(ev.event, (event) => {
        globalThis.emit = emit; // free \`emit\` resolves to THIS instance
        handler(state, event);
        rerender();
      });
    }
  }
}

// --- Shared pure patch helpers (no reference to any instance's state/root) ---

// Coerce a value to text, mirroring the build-time emitter: null/undefined -> "".
function toText(value) {
  return value === null || value === undefined ? "" : String(value);
}

// Resolve a serialized expression against the single state object. Mirrors
// src/expr/evaluate.ts's ident/member walk, but over \`state\` only (the glue
// re-runs neither setup nor get*; loop locals are build-time only).
function evalExpr(e, state) {
  if ("ident" in e) {
    return state == null ? undefined : state[e.ident];
  }
  const object = evalExpr(e.member, state);
  if (object === null || object === undefined) return undefined;
  return object[e.prop];
}

// Set an attribute, or REMOVE it when the value is null/undefined (mirroring
// the build-time "omit attribute on null/undefined" rule).
function setOrRemoveAttr(el, name, value) {
  const attribute = name.toLowerCase();
  if (BOOLEAN_ATTRIBUTES.has(attribute)) {
    const enabled = value !== null && value !== undefined && value !== false;
    el.toggleAttribute(name, enabled);
    if ((attribute === "checked" || attribute === "selected" || attribute === "muted") && attribute in el) {
      el[attribute] = enabled;
    }
  } else {
    if (value === null || value === undefined) el.removeAttribute(name);
    else el.setAttribute(name, toText(value));
    if (attribute === "value" && "value" in el) el.value = toText(value);
  }
}

// Join a serialized template's literal + expression parts into one string.
function joinParts(parts, state) {
  let out = "";
  for (const p of parts) {
    out += "lit" in p ? p.lit : toText(evalExpr(p.expr, state));
  }
  return out;
}

// Apply one compiled update instruction to a hooked element.
function applyUpdate(el, u, state) {
  if (u.kind === "text") {
    el.textContent = toText(evalExpr(u.expr, state));
  } else if (u.kind === "attr") {
    setOrRemoveAttr(el, u.name, evalExpr(u.expr, state));
  } else if (u.kind === "textTemplate") {
    el.textContent = joinParts(u.parts, state);
  } else if (u.kind === "attrTemplate") {
    setOrRemoveAttr(el, u.name, joinParts(u.parts, state));
  }
}

export { lastState as state, lastProps as props };
`;
}

/**
 * Backward-compatible single-component entry: wrap a component's hooks + one
 * instance (i0) into a {@link DistinctComponent} and emit the per-instance
 * module. Used by `compileComponent` whose output imports `./behavior.js`.
 */
export function emitGlue(hooks: BindingHook[], ctx: CodegenContext): string {
  const distinct: DistinctComponent = {
    absDir: ctx.absDir,
    scopeId: ctx.scopeId,
    componentName: ctx.componentName,
    css: "",
    hooks,
    instances: [{ instanceIndex: ctx.instanceIndex, props: ctx.mergedProps }],
  };
  return emitComponentGlue(distinct, "./behavior.js");
}
