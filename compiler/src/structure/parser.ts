/**
 * Recursive-descent parser for `.structure.adx` (docs/adx-grammar.md).
 *
 * Consumes the token stream from the tokenizer and produces the AST described
 * in grammar section 8. All error messages match the exact strings named in
 * the grammar; tests assert them verbatim.
 */

import { SourceText } from "../source.js";
import { adxError } from "../errors.js";
import { parseExpr } from "../expr/parse-expr.js";
import { tokenize, VOID_ELEMENTS, type Token } from "./tokenizer.js";
import type {
  Attr,
  Binding,
  Directives,
  ElementNode,
  EventBinding,
  Node,
  SlotNode,
  TextNode,
  TextPart,
} from "./ast.js";

const CLASS_NAME = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
const PROP_NAME = /^[a-zA-Z][a-zA-Z0-9-]*$/;
const DIRECTIVES = new Set([":if", ":else", ":for", ":key"]);

/** Parse an entire `.structure.adx` source into a list of top-level nodes. */
export function parseStructure(input: string, file: string): Node[] {
  const src = new SourceText(input, file);
  const tokens = tokenize(src);
  const parser = new Parser(tokens, file);
  const nodes = parser.parseNodes(null);
  checkDuplicateSlots(nodes, file);
  return nodes;
}

class Parser {
  private pos = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly file: string,
  ) {}

  /** Parse a sibling list until the close tag for `parentTag` (or EOF). */
  parseNodes(parentTag: string | null): Node[] {
    const nodes: Node[] = [];
    while (this.pos < this.tokens.length) {
      const tok = this.tokens[this.pos];
      if (tok.type === "close") {
        if (parentTag === null) {
          throw adxError(
            this.file,
            tok.line,
            `Unexpected close tag </${tok.tag}>`,
          );
        }
        if (tok.tag !== parentTag) {
          throw adxError(
            this.file,
            tok.line,
            `Expected </${parentTag}>, found </${tok.tag}>`,
          );
        }
        this.pos++; // consume close
        return nodes;
      }
      if (tok.type === "text") {
        this.pos++;
        nodes.push(this.makeText(tok.value, tok.line));
        continue;
      }
      // open
      nodes.push(this.parseElement());
    }

    if (parentTag !== null) {
      // We ran out of tokens before closing the parent.
      throw adxError(
        this.file,
        this.lastLine(),
        `Expected </${parentTag}>, found end of file`,
      );
    }
    this.validateElseChain(nodes);
    return nodes;
  }

  private parseElement(): Node {
    const open = this.tokens[this.pos];
    if (open.type !== "open") {
      throw adxError(this.file, open.line, "Expected element");
    }
    this.pos++;

    if (open.tag === "slot") {
      return this.parseSlot(open);
    }

    const parsed = this.parseAttributes(open.attrs, open.line, open.tag);

    let children: Node[] = [];
    let selfClosing = open.selfClosing;
    if (!selfClosing) {
      children = this.parseNodes(open.tag);
    }
    // Void elements are always treated as self-closing.
    if (VOID_ELEMENTS.has(open.tag)) {
      selfClosing = true;
    }

    const element: ElementNode = {
      kind: "element",
      tag: open.tag,
      line: open.line,
      classes: parsed.classes,
      bindings: parsed.bindings,
      attrs: parsed.attrs,
      events: parsed.events,
      directives: parsed.directives,
      children,
      selfClosing,
    };
    this.validateElseChain(children);
    return element;
  }

  private parseSlot(open: Extract<Token, { type: "open" }>): SlotNode {
    if (!open.selfClosing) {
      throw adxError(
        this.file,
        open.line,
        `Slot "<slot>" must be self-closing`,
      );
    }
    const parsed = this.parseAttributes(open.attrs, open.line, "slot");
    // The slot name is the first bare plain attribute (no value), else default.
    let name = "";
    const extraAttrs: Attr[] = [];
    for (const attr of parsed.attrs) {
      if (name === "" && attr.value === null) {
        name = attr.name;
      } else {
        extraAttrs.push(attr);
      }
    }
    if (
      parsed.bindings.length > 0 ||
      parsed.events.length > 0 ||
      extraAttrs.length > 0 ||
      parsed.directives.if ||
      parsed.directives.for ||
      parsed.directives.else ||
      parsed.directives.key
    ) {
      throw adxError(
        this.file,
        open.line,
        `Slot may only carry a name and class shorthands`,
      );
    }
    return {
      kind: "slot",
      name,
      classes: parsed.classes,
      line: open.line,
    };
  }

  private parseAttributes(
    raw: string,
    line: number,
    tag: string,
  ): {
    classes: string[];
    bindings: Binding[];
    attrs: Attr[];
    events: EventBinding[];
    directives: Directives;
  } {
    const shorthandClasses: string[] = [];
    const literalClasses: string[] = [];
    const bindings: Binding[] = [];
    const attrs: Attr[] = [];
    const events: EventBinding[] = [];
    const directives: Directives = {};
    const seenBindings = new Set<string>();
    const seenAttrs = new Set<string>();

    for (const atom of splitAttributes(raw)) {
      const { name, value } = atom;

      // Class shorthand: .name
      if (name.startsWith(".")) {
        const cls = name.slice(1);
        if (!CLASS_NAME.test(cls)) {
          throw adxError(this.file, line, `Invalid class name ".${cls}"`);
        }
        shorthandClasses.push(cls);
        continue;
      }

      // Directive or property binding: :x
      if (name.startsWith(":")) {
        if (DIRECTIVES.has(name)) {
          this.applyDirective(directives, name, value, line);
          continue;
        }
        const prop = name.slice(1);
        if (!PROP_NAME.test(prop)) {
          throw adxError(this.file, line, `Invalid binding name "${name}"`);
        }
        if (seenBindings.has(prop)) {
          throw adxError(this.file, line, `Duplicate attribute ":${prop}"`);
        }
        seenBindings.add(prop);
        bindings.push(this.makeBinding(prop, value, line));
        continue;
      }

      // Event binding: @event
      if (name.startsWith("@")) {
        const ev = name.slice(1);
        if (!PROP_NAME.test(ev)) {
          throw adxError(this.file, line, `Invalid event name "${name}"`);
        }
        if (value === null) {
          throw adxError(
            this.file,
            line,
            `Event "@${ev}" requires a handler`,
          );
        }
        events.push({ name: ev, handler: value.trim() });
        continue;
      }

      // Plain attribute: name or name="literal"
      if (name === "class" && value !== null) {
        for (const c of value.split(/\s+/).filter(Boolean)) {
          literalClasses.push(c);
        }
        continue;
      }
      if (seenAttrs.has(name)) {
        throw adxError(this.file, line, `Duplicate attribute "${name}"`);
      }
      seenAttrs.add(name);
      attrs.push({ name, value });
    }

    void tag; // tag reserved for future per-element validation
    return {
      classes: mergeClasses(literalClasses, shorthandClasses),
      bindings,
      attrs,
      events,
      directives,
    };
  }

  private applyDirective(
    directives: Directives,
    name: string,
    value: string | null,
    line: number,
  ): void {
    switch (name) {
      case ":if": {
        if (value === null) {
          throw adxError(this.file, line, `":if" requires an expression`);
        }
        if (directives.else) {
          throw adxError(
            this.file,
            line,
            `":if" and ":else" on the same element`,
          );
        }
        directives.if = parseExpr(value, this.file, line);
        return;
      }
      case ":else": {
        if (directives.if) {
          throw adxError(
            this.file,
            line,
            `":if" and ":else" on the same element`,
          );
        }
        directives.else = true;
        return;
      }
      case ":for": {
        if (value === null) {
          throw adxError(
            this.file,
            line,
            `Invalid :for expression "" (expected "item in items")`,
          );
        }
        directives.for = this.parseFor(value, line);
        return;
      }
      case ":key": {
        if (value === null) {
          throw adxError(this.file, line, `":key" requires an expression`);
        }
        directives.key = parseExpr(value, this.file, line);
        return;
      }
      default:
        throw adxError(this.file, line, `Unknown directive "${name}"`);
    }
  }

  private parseFor(raw: string, line: number): Directives["for"] {
    const value = raw.trim();
    // Match "item in items" or "(item, i) in items".
    const parenMatch = /^\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)\s+in\s+(.+)$/.exec(
      value,
    );
    if (parenMatch) {
      return {
        item: parenMatch[1],
        index: parenMatch[2],
        iterable: parseExpr(parenMatch[3], this.file, line),
      };
    }
    const simpleMatch = /^([A-Za-z_$][\w$]*)\s+in\s+(.+)$/.exec(value);
    if (simpleMatch) {
      return {
        item: simpleMatch[1],
        iterable: parseExpr(simpleMatch[2], this.file, line),
      };
    }
    throw adxError(
      this.file,
      line,
      `Invalid :for expression "${value}" (expected "item in items")`,
    );
  }

  private makeBinding(prop: string, value: string | null, line: number): Binding {
    if (value === null) {
      throw adxError(this.file, line, `Binding ":${prop}" requires a value`);
    }
    // A :prop value with no interpolation is a bare expression (grammar 2.2);
    // one whose whole value is a single {{expr}} is equivalent (grammar 3).
    if (!value.includes("{{")) {
      return { name: prop, expr: parseExpr(value, this.file, line) };
    }
    const parts = this.parseTemplate(value, line);
    // A single whole-value expression collapses to `expr`.
    if (parts.length === 1 && "expr" in parts[0]) {
      return { name: prop, expr: parts[0].expr };
    }
    // Mixed literal + holes stays a template.
    return { name: prop, template: parts };
  }

  private makeText(value: string, line: number): TextNode {
    return { kind: "text", line, parts: this.parseTemplate(value.trim(), line) };
  }

  /**
   * Parse a template string: literal text interleaved with `{{ expr }}` holes.
   * Returns a TextPart[]. A value with no holes yields a single literal part.
   */
  private parseTemplate(value: string, line: number): TextPart[] {
    const parts: TextPart[] = [];
    let i = 0;
    let litStart = 0;
    while (i < value.length) {
      if (value.startsWith("{{", i)) {
        if (i > litStart) {
          parts.push({ lit: value.slice(litStart, i) });
        }
        const end = value.indexOf("}}", i + 2);
        if (end === -1) {
          throw adxError(this.file, line, "Unterminated interpolation");
        }
        const exprSrc = value.slice(i + 2, end);
        parts.push({ expr: parseExpr(exprSrc, this.file, line) });
        i = end + 2;
        litStart = i;
      } else {
        i++;
      }
    }
    if (litStart < value.length) {
      parts.push({ lit: value.slice(litStart) });
    }
    if (parts.length === 0) {
      parts.push({ lit: "" });
    }
    return parts;
  }

  /** Validate `:else` elements pair with a preceding `:if` sibling. */
  private validateElseChain(nodes: Node[]): void {
    for (let idx = 0; idx < nodes.length; idx++) {
      const node = nodes[idx];
      if (node.kind !== "element" || !node.directives.else) continue;
      // Find the previous non-text sibling.
      let prevIdx = idx - 1;
      while (prevIdx >= 0 && nodes[prevIdx].kind === "text") prevIdx--;
      const prev = prevIdx >= 0 ? nodes[prevIdx] : undefined;
      if (!prev || prev.kind !== "element" || !prev.directives.if) {
        throw adxError(
          this.file,
          node.line,
          `":else" without matching ":if"`,
        );
      }
    }
  }

  private lastLine(): number {
    const last = this.tokens[this.tokens.length - 1];
    return last ? last.line : 1;
  }
}

/** Walk the whole tree and reject duplicate slot names (grammar section 6). */
function checkDuplicateSlots(nodes: Node[], file: string): void {
  const seen = new Set<string>();
  const walk = (list: Node[]): void => {
    for (const node of list) {
      if (node.kind === "slot") {
        if (seen.has(node.name)) {
          throw adxError(file, node.line, `Duplicate slot "${node.name}"`);
        }
        seen.add(node.name);
      } else if (node.kind === "element") {
        walk(node.children);
      }
    }
  };
  walk(nodes);
}

/** Merge literal classes (first) then shorthand classes, dedup left-to-right. */
function mergeClasses(literal: string[], shorthand: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const c of [...literal, ...shorthand]) {
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

interface AttrAtom {
  name: string;
  value: string | null;
}

/**
 * Split a raw attribute string into name/value atoms. Handles quoted values
 * (which may contain spaces and `{{ }}`) and valueless attributes.
 */
function splitAttributes(raw: string): AttrAtom[] {
  const atoms: AttrAtom[] = [];
  const s = raw;
  let i = 0;
  const n = s.length;
  while (i < n) {
    // Skip whitespace between atoms.
    while (i < n && /\s/.test(s[i])) i++;
    if (i >= n) break;

    // Read the name up to whitespace or '='.
    const nameStart = i;
    while (i < n && !/\s/.test(s[i]) && s[i] !== "=") i++;
    const name = s.slice(nameStart, i);
    if (name.length === 0) break;

    // Skip whitespace before a potential '='.
    let j = i;
    while (j < n && /\s/.test(s[j])) j++;
    if (s[j] === "=") {
      i = j + 1;
      while (i < n && /\s/.test(s[i])) i++;
      let value: string;
      if (s[i] === '"' || s[i] === "'") {
        const quote = s[i];
        const start = i + 1;
        i++;
        while (i < n && s[i] !== quote) i++;
        value = s.slice(start, i);
        i++; // consume closing quote
      } else {
        const start = i;
        while (i < n && !/\s/.test(s[i])) i++;
        value = s.slice(start, i);
      }
      atoms.push({ name, value });
    } else {
      atoms.push({ name, value: null });
    }
  }
  return atoms;
}
