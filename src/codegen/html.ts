/**
 * Static HTML emitter.
 *
 * Turns a parsed `.structure.adx` AST into complete static HTML with every
 * `{{interpolation}}` and `:prop` binding resolved at BUILD TIME (the SEO
 * contract: a crawler that never runs JS sees the full content). Control flow
 * is applied here too — `:if`/`:else` select which branch is emitted and `:for`
 * is unrolled against the build-time scope.
 *
 * Scoping: the component's owned elements carry `data-adx-c="<scopeId>"` so the
 * scoped CSS ([data-adx-c="<id>"] ...) only matches them. Each INSTANCE's
 * top-level owned element(s) additionally carry `data-adx-i="i<ordinal>"` so
 * the per-instance glue can locate each instance's own root. Nodes that have
 * runtime bindings/events additionally carry a stable
 * `data-adx-b="<scope>-i<ordinal>-<n>"` hook the hydration glue selects by (it
 * never rebuilds the DOM).
 *
 * Composition: when the emitter meets an element whose tag is neither a known
 * HTML element nor `slot`, it defers to the build's composer, which resolves
 * the tag against `manifest.deps`, recursively compiles the child instance, and
 * splices the child body in place of the custom tag.
 *
 * The emitter leaves ZERO `{{` in its output.
 */

import type {
  Node,
  ElementNode,
  SlotNode,
  TextNode,
  TextPart,
  Binding,
  Expr,
} from "../structure/ast.js";
import type { EvalScope } from "../expr/evaluate.js";
import { evaluate, truthy, toText } from "../expr/evaluate.js";
import { VOID_ELEMENTS } from "../structure/tokenizer.js";
import { instanceBindingId } from "./scope.js";
import { isHtmlTag } from "./html-tags.js";
import { bareComputedKey } from "../behavior/compute-key.js";
import type { CodegenContext, BuildState, EmitParent } from "./context.js";

/**
 * A JSON-serializable expression the glue re-evaluates at runtime: a bare
 * identifier or a member-access chain. A 1:1 lowering of the AST {@link Expr}.
 */
export type SerExpr = { ident: string } | { member: SerExpr; prop: string };

/** A piece of a serialized template run: literal text or an expression hole. */
export type SerPart = { lit: string } | { expr: SerExpr };

/**
 * A single build-time-compiled instruction the glue applies on `rerender`:
 * patch a hooked node's attribute or single text run from the current `state`.
 */
export type UpdateInstr =
  | { kind: "attr"; name: string; expr: SerExpr }
  | { kind: "text"; expr: SerExpr }
  | { kind: "attrTemplate"; name: string; parts: SerPart[] }
  | { kind: "textTemplate"; parts: SerPart[] };

/** A node that carries runtime bindings/events, recorded for the glue. */
export interface BindingHook {
  /** The `data-adx-b` id assigned to this node (this instance's resolved id). */
  id: string;
  /** The per-instance node index `n` (the glue rebuilds ids per instance from
   * `${scope}-i${instanceIndex}-${n}`). */
  n: number;
  /** Event handler names wired on the node (`@event="handler"`). */
  events: Array<{ event: string; handler: string }>;
  /** Binding names that resolve at build time but may re-run on hydration. */
  bindings: string[];
  /**
   * Build-time-compiled patch instructions. On `rerender` the glue re-applies
   * each against the instance's `state`. Computed-backed (`get*`) runs are
   * FROZEN at lowering time and emit NO instruction, so they keep their
   * build-time value and are never blanked.
   */
  updates: UpdateInstr[];
}

/** Lower an AST {@link Expr} to its JSON-serializable {@link SerExpr} form. */
export function lowerExpr(expr: Expr): SerExpr {
  if (expr.kind === "ident") {
    return { ident: expr.name };
  }
  return { member: lowerExpr(expr.object), prop: expr.property };
}

/** The base identifier of a {@link SerExpr}, unwrapping any member chain. */
export function rootIdent(e: SerExpr): string {
  return "ident" in e ? e.ident : rootIdent(e.member);
}

/** Result of HTML emission: the markup plus the ordered binding hooks. */
export interface HtmlEmitResult {
  html: string;
  hooks: BindingHook[];
}

/**
 * Slot projection context for a composed child's emit: the parent-projected
 * nodes grouped by slot name and the callback that emits them under the
 * parent's identity (parent-owned projected nodes).
 */
export interface SlotContext {
  projected: Map<string, Node[]>;
  emitParent: EmitParent;
  /** The parent scope projected nodes bind against (parent-authored). */
  parentScope: EvalScope;
}

/** Mutable per-emit state (binding-hook counter + collected hooks). */
export interface EmitState {
  ctx: CodegenContext;
  bindingCount: number;
  hooks: BindingHook[];
  /**
   * Bare computed names (`getDisplayName` -> `displayName`) built once per
   * emit from `ctx.behavior.computed` (reusing the Phase 1 helper). A run whose
   * expression's ROOT ident is in this set is FROZEN — no UpdateInstr emitted.
   */
  computedKeys: Set<string>;
  /** The page-global build accumulator (composition/dedupe); optional for the
   * direct-emit path used by unit tests. */
  build?: BuildState;
  /** When set (a composed child), `<slot>` emits parent-projected content. */
  slots?: SlotContext;
}

/** Emit complete static HTML for a component's structure AST. */
export function emitHtml(
  ast: Node[],
  ctx: CodegenContext,
  build?: BuildState,
  slots?: SlotContext,
): HtmlEmitResult {
  const state: EmitState = {
    ctx,
    bindingCount: 0,
    hooks: [],
    computedKeys: new Set(ctx.behavior.computed.map(bareComputedKey)),
    build,
    slots,
  };
  // Top-level owned elements of this instance get `data-adx-i`.
  const out = emitSiblings(ast, ctx.scope, state, true);
  return { html: out.join(""), hooks: state.hooks };
}

/**
 * Re-enter emission against an EXISTING state so projected slot nodes are
 * emitted with the parent's scope id / instance ordinal / shared binding
 * counter (projected nodes are parent-owned). Used by the compose layer.
 */
export function makeEmitParent(state: EmitState): EmitParent {
  return (nodes, scope) => {
    const out = emitSiblings(nodes, scope, state, false);
    return { html: out.join(""), hooks: state.hooks };
  };
}

/**
 * Emit a sibling list, applying `:if`/`:else` pairing by position. `:else`
 * pairs with the nearest preceding element sibling that had `:if`
 * (whitespace/comment text between them is ignored for pairing but still
 * emitted verbatim when it carries content).
 *
 * `topLevel` marks siblings that are instance roots (they receive
 * `data-adx-i`).
 */
function emitSiblings(
  nodes: Node[],
  scope: EvalScope,
  state: EmitState,
  topLevel: boolean,
): string[] {
  const out: string[] = [];
  // Tracks the truthiness of the most recent `:if` element among siblings so a
  // following `:else` knows whether to render.
  let lastIfTaken: boolean | null = null;

  for (const node of nodes) {
    if (node.kind === "element") {
      const d = node.directives;
      if (d.else) {
        // Render only if the paired :if was NOT taken.
        if (lastIfTaken === false) {
          out.push(...emitElementMaybeFor(node, scope, state, topLevel));
        }
        lastIfTaken = null;
        continue;
      }
      if (d.if) {
        const taken = truthy(evaluate(d.if, scope));
        lastIfTaken = taken;
        if (taken) {
          out.push(...emitElementMaybeFor(node, scope, state, topLevel));
        }
        continue;
      }
      // Plain element resets any pending :if/:else pairing.
      lastIfTaken = null;
      out.push(...emitElementMaybeFor(node, scope, state, topLevel));
      continue;
    }

    if (node.kind === "slot") {
      lastIfTaken = null;
      out.push(emitSlot(node, state));
      continue;
    }

    // Text node: emit resolved text. Whitespace-only text does not break
    // :if/:else sibling pairing.
    const text = emitText(node, scope);
    if (text.trim().length > 0) {
      lastIfTaken = null;
    }
    out.push(text);
  }

  return out;
}

/** Apply `:for` (unroll) around an element, then emit each iteration. */
function emitElementMaybeFor(
  node: ElementNode,
  scope: EvalScope,
  state: EmitState,
  topLevel: boolean,
): string[] {
  const loop = node.directives.for;
  if (!loop) {
    return [emitElement(node, scope, state, topLevel, false)];
  }
  const iterable = evaluate(loop.iterable, scope);
  if (!Array.isArray(iterable)) {
    return [];
  }
  const out: string[] = [];
  iterable.forEach((item, index) => {
    const frame: Record<string, unknown> = { [loop.item]: item };
    if (loop.index) {
      frame[loop.index] = index;
    }
    const childScope: EvalScope = {
      ...scope,
      locals: [frame, ...(scope.locals ?? [])],
    };
    // Unrolled `:for` nodes get events-only hooks — their text/attrs are
    // build-time frozen and never live-patched (no structural reactivity).
    out.push(emitElement(node, childScope, state, topLevel, true));
  });
  return out;
}

/** Emit a single element (open tag + attrs + children + close). */
function emitElement(
  node: ElementNode,
  scope: EvalScope,
  state: EmitState,
  topLevel: boolean,
  loopLocal: boolean,
): string {
  // Custom component tag (not a known HTML element, not a slot) -> compose.
  if (!isHtmlTag(node.tag) && node.tag !== "slot") {
    if (!state.build) {
      // No build context (direct unit-test emit): emit verbatim as M1 did.
      return emitPlainElement(node, scope, state, topLevel, loopLocal);
    }
    return state.build.compose(
      node,
      state.ctx,
      scope,
      makeEmitParent(state),
    );
  }
  return emitPlainElement(node, scope, state, topLevel, loopLocal);
}

/** Emit a plain HTML element with scope/instance/binding attributes. */
function emitPlainElement(
  node: ElementNode,
  scope: EvalScope,
  state: EmitState,
  topLevel: boolean,
  loopLocal: boolean,
): string {
  const attrs: string[] = [];

  // Classes.
  if (node.classes.length > 0) {
    attrs.push(`class="${escapeAttr(node.classes.join(" "))}"`);
  }

  // Resolved :prop bindings become real attributes in the static HTML.
  for (const binding of node.bindings) {
    const value = resolveBinding(binding, scope);
    if (value === null) continue; // undefined/null -> omit attribute
    attrs.push(`${binding.name}="${escapeAttr(value)}"`);
  }

  // Plain attributes (literal, verbatim). Boolean attrs have null value.
  for (const attr of node.attrs) {
    if (attr.value === null) {
      attrs.push(attr.name);
    } else {
      attrs.push(`${attr.name}="${escapeAttr(attr.value)}"`);
    }
  }

  // Scope attribute on every owned element.
  attrs.push(`data-adx-c="${state.ctx.scopeId}"`);

  // Per-instance root discriminator on each top-level owned element.
  if (topLevel) {
    attrs.push(`data-adx-i="i${state.ctx.instanceIndex}"`);
  }

  // Binding hook (MEDIUM-5): a hook is emitted when a node has bindings OR
  // events OR a single interpolated text run (its children are exactly one
  // TextNode carrying >=1 {{expr}} part — the dominant <h2>{{name}}</h2> case).
  // One hook carries the node's events AND its update instructions (attr
  // updates from :prop bindings plus a text/textTemplate update from the single
  // text run). `:for`-unrolled nodes (loopLocal=true) are events-only: their
  // text/attributes are build-time frozen and never live-patched.
  const textRun = singleInterpolatedTextRun(node);
  if (
    node.bindings.length > 0 ||
    node.events.length > 0 ||
    textRun !== null
  ) {
    const n = state.bindingCount++;
    const id = instanceBindingId(state.ctx.scopeId, state.ctx.instanceIndex, n);
    attrs.push(`data-adx-b="${id}"`);
    const updates = loopLocal
      ? []
      : buildUpdates(node.bindings, textRun, state.computedKeys);
    state.hooks.push({
      id,
      n,
      events: node.events.map((e) => ({ event: e.name, handler: e.handler })),
      bindings: node.bindings.map((b) => b.name),
      updates,
    });
  }

  const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
  const tag = node.tag;
  const isVoid = VOID_ELEMENTS.has(tag) || node.selfClosing;

  if (isVoid) {
    return `<${tag}${attrStr} />`;
  }

  // Children are never instance roots (topLevel = false).
  const inner = emitSiblings(node.children, scope, state, false).join("");
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

/**
 * Emit a slot. In a composed child (`state.slots` set) the placeholder is
 * dropped and the parent-projected content for this slot name is emitted via
 * the parent's emit pass (so projected nodes carry the parent's identity). In
 * standalone compilation the M1 `<slot data-adx-slot="<name>">` placeholder is
 * emitted.
 */
function emitSlot(node: SlotNode, state: EmitState): string {
  if (state.slots) {
    const nodes = state.slots.projected.get(node.name) ?? [];
    // Projected nodes are emitted under the PARENT's identity (scope id,
    // instance ordinal, hook ids) — only their DOM position is the child's.
    return state.slots.emitParent(nodes, state.slots.parentScope).html;
  }
  const attrs: string[] = [];
  if (node.classes.length > 0) {
    attrs.push(`class="${escapeAttr(node.classes.join(" "))}"`);
  }
  attrs.push(`data-adx-slot="${escapeAttr(node.name)}"`);
  attrs.push(`data-adx-c="${state.ctx.scopeId}"`);
  return `<slot ${attrs.join(" ")}></slot>`;
}

/** Resolve a text node's parts into escaped static text. */
function emitText(node: TextNode, scope: EvalScope): string {
  let out = "";
  for (const part of node.parts) {
    if ("lit" in part) {
      out += escapeText(part.lit);
    } else {
      out += escapeText(toText(evaluate(part.expr, scope)));
    }
  }
  return out;
}

/**
 * Resolve a `:prop` binding to its emitted attribute value, or `null` when it
 * resolves to null/undefined (so the attribute is omitted entirely).
 */
function resolveBinding(binding: Binding, scope: EvalScope): string | null {
  if (binding.template) {
    return resolveTemplate(binding.template, scope);
  }
  if (binding.expr) {
    const value = evaluate(binding.expr, scope);
    if (value === null || value === undefined) return null;
    return toText(value);
  }
  return "";
}

function resolveTemplate(parts: TextPart[], scope: EvalScope): string {
  let out = "";
  for (const part of parts) {
    out += "lit" in part ? part.lit : toText(evaluate(part.expr, scope));
  }
  return out;
}

/**
 * Return the element's single interpolated text run — the parts of its one
 * `TextNode` child — when its children are exactly one `TextNode` carrying at
 * least one `{{expr}}` part (the dominant `<h2>{{name}}</h2>` case). Otherwise
 * `null` (no children, multiple children, element children mixed in, or a
 * pure-literal text node, which needs no update). This is the only text shape
 * M2 live-patches; a node mixing interpolation with child elements is left
 * build-time correct but not patched.
 */
function singleInterpolatedTextRun(node: ElementNode): TextPart[] | null {
  if (node.children.length !== 1) return null;
  const only = node.children[0];
  if (only.kind !== "text") return null;
  const hasHole = only.parts.some((p) => "expr" in p);
  return hasHole ? only.parts : null;
}

/**
 * Build the per-hook update plan: an attr update per `:prop` binding plus one
 * text update for a single interpolated text run. The freeze rule (HIGH-1) is
 * applied uniformly — a run whose expression's ROOT ident is a computed name is
 * frozen (no UpdateInstr), so computed-backed content keeps its build-time
 * value and is never blanked on `rerender`.
 */
function buildUpdates(
  bindings: Binding[],
  textRun: TextPart[] | null,
  computedKeys: Set<string>,
): UpdateInstr[] {
  const updates: UpdateInstr[] = [];

  for (const binding of bindings) {
    const instr = attrUpdate(binding, computedKeys);
    if (instr) updates.push(instr);
  }

  if (textRun) {
    const instr = textUpdate(textRun, computedKeys);
    if (instr) updates.push(instr);
  }

  return updates;
}

/** `true` iff the serialized expression's root ident is a computed name. */
function isFrozen(e: SerExpr, computedKeys: Set<string>): boolean {
  return computedKeys.has(rootIdent(e));
}

/** Lower a `:prop` binding to an attr/attrTemplate update, or null if frozen. */
function attrUpdate(
  binding: Binding,
  computedKeys: Set<string>,
): UpdateInstr | null {
  if (binding.template) {
    const parts = binding.template;
    // Freeze the whole attr if ANY expr part's root ident is computed.
    if (
      parts.some((p) => "expr" in p && isFrozen(lowerExpr(p.expr), computedKeys))
    ) {
      return null;
    }
    return {
      kind: "attrTemplate",
      name: binding.name,
      parts: parts.map(lowerPart),
    };
  }
  if (binding.expr) {
    const expr = lowerExpr(binding.expr);
    if (isFrozen(expr, computedKeys)) return null;
    return { kind: "attr", name: binding.name, expr };
  }
  return null;
}

/** Lower a single text run to a text/textTemplate update, or null if frozen. */
function textUpdate(
  parts: TextPart[],
  computedKeys: Set<string>,
): UpdateInstr | null {
  // Freeze the whole run if ANY expr part's root ident is computed.
  if (
    parts.some((p) => "expr" in p && isFrozen(lowerExpr(p.expr), computedKeys))
  ) {
    return null;
  }
  // A single bare `{{expr}}` with no literal parts becomes a `text` update;
  // otherwise a `textTemplate` preserving the literal interleaving.
  if (parts.length === 1 && "expr" in parts[0]) {
    return { kind: "text", expr: lowerExpr(parts[0].expr) };
  }
  return { kind: "textTemplate", parts: parts.map(lowerPart) };
}

/** Lower an AST {@link TextPart} to its serialized {@link SerPart} form. */
function lowerPart(part: TextPart): SerPart {
  return "lit" in part ? { lit: part.lit } : { expr: lowerExpr(part.expr) };
}

/** Escape text content for safe HTML emission (static output). */
function escapeText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape an attribute value (double-quoted context). */
function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
