/**
 * AST shape for parsed `.structure.adx` files.
 *
 * Mirrors docs/adx-grammar.md section 8 exactly. Field names are a contract
 * consumed by codegen (FEAT-002) and the expression evaluator; do not rename
 * without updating the grammar doc and dependants.
 */

/** A build-time expression: a bare identifier or a member-access chain. */
export type Expr =
  | { kind: "ident"; name: string }
  | { kind: "member"; object: Expr; property: string };

/** A piece of a text/template run: literal text or an interpolation hole. */
export type TextPart = { lit: string } | { expr: Expr };

/** `:prop="..."` binding. `template` is set when the value mixes literal text
 * with `{{ }}` holes; otherwise `expr` holds the single resolved expression. */
export interface Binding {
  name: string;
  /** Single-expression binding (whole value is one `{{expr}}` or bare expr). */
  expr?: Expr;
  /** Mixed template binding (literal text interleaved with holes). */
  template?: TextPart[];
}

/** Plain attribute: `name` (boolean, value null) or `name="literal"`. */
export interface Attr {
  name: string;
  value: string | null;
}

/** `@event="handler"` — handler is a bare behavior export name. */
export interface EventBinding {
  name: string;
  handler: string;
}

/** Control-flow directives attached to an element. */
export interface Directives {
  if?: Expr;
  else?: true;
  for?: { item: string; index?: string; iterable: Expr };
  key?: Expr;
}

export interface ElementNode {
  kind: "element";
  tag: string;
  line: number;
  classes: string[];
  bindings: Binding[];
  attrs: Attr[];
  events: EventBinding[];
  directives: Directives;
  children: Node[];
  selfClosing: boolean;
}

export interface SlotNode {
  kind: "slot";
  name: string;
  classes: string[];
  line: number;
}

export interface TextNode {
  kind: "text";
  line: number;
  parts: TextPart[];
}

export type Node = ElementNode | SlotNode | TextNode;
