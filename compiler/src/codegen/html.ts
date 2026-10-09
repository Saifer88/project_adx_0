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
 * scoped CSS ([data-adx-c="<id>"] ...) only matches them. Nodes that have
 * runtime bindings/events additionally carry a stable `data-adx-b="<id>-<n>"`
 * hook the hydration glue selects by (it never rebuilds the DOM).
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
} from "../structure/ast.js";
import type { EvalScope } from "../expr/evaluate.js";
import { evaluate, truthy, toText } from "../expr/evaluate.js";
import { VOID_ELEMENTS } from "../structure/tokenizer.js";
import { bindingId } from "./scope.js";
import type { CodegenContext } from "./context.js";

/** A node that carries runtime bindings/events, recorded for the glue. */
export interface BindingHook {
  /** The `data-adx-b` id assigned to this node. */
  id: string;
  /** Event handler names wired on the node (`@event="handler"`). */
  events: Array<{ event: string; handler: string }>;
  /** Binding names that resolve at build time but may re-run on hydration. */
  bindings: string[];
}

/** Result of HTML emission: the markup plus the ordered binding hooks. */
export interface HtmlEmitResult {
  html: string;
  hooks: BindingHook[];
}

/** Mutable per-emit state (binding-hook counter + collected hooks). */
interface EmitState {
  ctx: CodegenContext;
  bindingCount: number;
  hooks: BindingHook[];
}

/** Emit complete static HTML for a component's structure AST. */
export function emitHtml(ast: Node[], ctx: CodegenContext): HtmlEmitResult {
  const state: EmitState = { ctx, bindingCount: 0, hooks: [] };
  const out = emitSiblings(ast, ctx.scope, state);
  return { html: out.join(""), hooks: state.hooks };
}

/**
 * Emit a sibling list, applying `:if`/`:else` pairing by position. `:else`
 * pairs with the nearest preceding element sibling that had `:if`
 * (whitespace/comment text between them is ignored for pairing but still
 * emitted verbatim when it carries content).
 */
function emitSiblings(
  nodes: Node[],
  scope: EvalScope,
  state: EmitState,
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
          out.push(...emitElementMaybeFor(node, scope, state));
        }
        lastIfTaken = null;
        continue;
      }
      if (d.if) {
        const taken = truthy(evaluate(d.if, scope));
        lastIfTaken = taken;
        if (taken) {
          out.push(...emitElementMaybeFor(node, scope, state));
        }
        continue;
      }
      // Plain element resets any pending :if/:else pairing.
      lastIfTaken = null;
      out.push(...emitElementMaybeFor(node, scope, state));
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
): string[] {
  const loop = node.directives.for;
  if (!loop) {
    return [emitElement(node, scope, state)];
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
    out.push(emitElement(node, childScope, state));
  });
  return out;
}

/** Emit a single element (open tag + attrs + children + close). */
function emitElement(
  node: ElementNode,
  scope: EvalScope,
  state: EmitState,
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

  // Binding hook: nodes that have bindings or events get a stable hook the glue
  // selects by. (:for/:if are build-time only and do not need a hook unless the
  // node also has bindings/events.)
  if (node.bindings.length > 0 || node.events.length > 0) {
    const id = bindingId(state.ctx.scopeId, state.bindingCount++);
    attrs.push(`data-adx-b="${id}"`);
    state.hooks.push({
      id,
      events: node.events.map((e) => ({ event: e.name, handler: e.handler })),
      bindings: node.bindings.map((b) => b.name),
    });
  }

  const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
  const tag = node.tag;
  const isVoid = VOID_ELEMENTS.has(tag) || node.selfClosing;

  if (isVoid) {
    return `<${tag}${attrStr} />`;
  }

  const inner = emitSiblings(node.children, scope, state).join("");
  return `<${tag}${attrStr}>${inner}</${tag}>`;
}

/** Emit a slot placeholder: `<slot data-adx-slot="<name>" ...>`. */
function emitSlot(node: SlotNode, state: EmitState): string {
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
