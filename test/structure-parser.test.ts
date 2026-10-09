import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseStructure } from "../src/structure/parser.js";
import type { ElementNode, SlotNode, TextNode } from "../src/structure/ast.js";

const here = dirname(fileURLToPath(import.meta.url));
const structurePath = join(
  here,
  "..",
  "fixtures",
  "user-card",
  "structure.adx",
);

const parse = (src: string) => parseStructure(src, "structure.adx");

describe("structure parser — UserCard fixture", () => {
  it("produces the grammar section 8 AST", () => {
    const nodes = parse(readFileSync(structurePath, "utf8"));
    expect(nodes).toHaveLength(1);
    const article = nodes[0] as ElementNode;
    expect(article.kind).toBe("element");
    expect(article.tag).toBe("article");
    expect(article.classes).toEqual(["card"]);
    expect(article.events).toEqual([{ name: "click", handler: "onClick" }]);

    const children = article.children.filter((n) => n.kind !== "text");
    // img, content div, slot
    expect(children).toHaveLength(3);

    const img = children[0] as ElementNode;
    expect(img.tag).toBe("img");
    expect(img.selfClosing).toBe(true);
    expect(img.classes).toEqual(["avatar"]);
    expect(img.bindings).toEqual([
      { name: "src", expr: { kind: "ident", name: "avatar" } },
      { name: "alt", expr: { kind: "ident", name: "name" } },
    ]);

    const content = children[1] as ElementNode;
    expect(content.classes).toEqual(["content"]);
    const contentKids = content.children.filter((n) => n.kind === "element") as ElementNode[];
    const h2 = contentKids[0];
    expect(h2.tag).toBe("h2");
    const h2Text = h2.children.find((n) => n.kind === "text") as TextNode;
    expect(h2Text.parts).toEqual([{ expr: { kind: "ident", name: "name" } }]);

    const bioP = contentKids[2];
    expect(bioP.directives.if).toEqual({ kind: "ident", name: "bio" });

    const slot = children[2] as SlotNode;
    expect(slot.kind).toBe("slot");
    expect(slot.name).toBe("actions");
    expect(slot.classes).toEqual(["actions"]);
  });
});

describe("structure parser — features", () => {
  it("parses :for with index and :key in loop scope", () => {
    const nodes = parse(
      `<ul :if="tags"><li :for="(t, i) in tags" :key="t.id">{{t.label}}</li></ul>`,
    );
    const ul = nodes[0] as ElementNode;
    expect(ul.directives.if).toEqual({ kind: "ident", name: "tags" });
    const li = ul.children.find((n) => n.kind === "element") as ElementNode;
    expect(li.directives.for).toEqual({
      item: "t",
      index: "i",
      iterable: { kind: "ident", name: "tags" },
    });
    expect(li.directives.key).toEqual({
      kind: "member",
      object: { kind: "ident", name: "t" },
      property: "id",
    });
    const text = li.children.find((n) => n.kind === "text") as TextNode;
    expect(text.parts).toEqual([
      {
        expr: {
          kind: "member",
          object: { kind: "ident", name: "t" },
          property: "label",
        },
      },
    ]);
  });

  it("parses :for without index", () => {
    const nodes = parse(`<li :for="item in items">x</li>`);
    const li = nodes[0] as ElementNode;
    expect(li.directives.for).toEqual({
      item: "item",
      iterable: { kind: "ident", name: "items" },
    });
    expect(li.directives.for?.index).toBeUndefined();
  });

  it("pairs :else with a preceding :if sibling", () => {
    const nodes = parse(`<p :if="a">A</p><p :else>B</p>`);
    const second = nodes[1] as ElementNode;
    expect(second.directives.else).toBe(true);
  });

  it("ignores whitespace/text between :if and :else", () => {
    const nodes = parse(`<p :if="a">A</p>\n   \n<p :else>B</p>`);
    const els = nodes.filter((n) => n.kind === "element") as ElementNode[];
    expect(els[1].directives.else).toBe(true);
  });

  it("parses attribute interpolation as a template", () => {
    const nodes = parse(`<img :alt="user {{name}}">`);
    const img = nodes[0] as ElementNode;
    expect(img.bindings[0]).toEqual({
      name: "alt",
      template: [
        { lit: "user " },
        { expr: { kind: "ident", name: "name" } },
      ],
    });
  });

  it("collapses a single-hole binding to expr", () => {
    const nodes = parse(`<img :src="{{avatar}}">`);
    const img = nodes[0] as ElementNode;
    expect(img.bindings[0]).toEqual({
      name: "src",
      expr: { kind: "ident", name: "avatar" },
    });
  });

  it("merges literal class and shorthand classes, deduped (grammar 2.5)", () => {
    const nodes = parse(`<div class="a b" .b .c></div>`);
    const div = nodes[0] as ElementNode;
    expect(div.classes).toEqual(["a", "b", "c"]);
  });

  it("parses plain and boolean attributes", () => {
    const nodes = parse(`<input type="email" required>`);
    const input = nodes[0] as ElementNode;
    expect(input.attrs).toEqual([
      { name: "type", value: "email" },
      { name: "required", value: null },
    ]);
    expect(input.selfClosing).toBe(true);
  });

  it("drops comments", () => {
    const nodes = parse(`<div><!-- hi -->x</div>`);
    const div = nodes[0] as ElementNode;
    const text = div.children.find((n) => n.kind === "text") as TextNode;
    expect(text.parts).toEqual([{ lit: "x" }]);
  });

  it("supports multiple top-level nodes (fragment root)", () => {
    const nodes = parse(`<p>one</p><p>two</p>`);
    expect(nodes).toHaveLength(2);
  });
});

describe("structure parser — exact error messages", () => {
  it("unterminated interpolation", () => {
    expect(() => parse(`<p>{{name</p>`)).toThrow(
      "[ADX] structure.adx:1 - Unterminated interpolation",
    );
  });

  it(":else without matching :if", () => {
    expect(() => parse(`<p :else>B</p>`)).toThrow(
      '[ADX] structure.adx:1 - ":else" without matching ":if"',
    );
  });

  it("duplicate slot name", () => {
    expect(() => parse(`<div><slot actions /><slot actions /></div>`)).toThrow(
      '[ADX] structure.adx:1 - Duplicate slot "actions"',
    );
  });

  it("mismatched close tag", () => {
    expect(() => parse(`<div></span>`)).toThrow(
      "[ADX] structure.adx:1 - Expected </div>, found </span>",
    );
  });

  it("invalid :for expression", () => {
    expect(() => parse(`<li :for="items">x</li>`)).toThrow(
      '[ADX] structure.adx:1 - Invalid :for expression "items" (expected "item in items")',
    );
  });

  it("unsupported expression", () => {
    expect(() => parse(`<p>{{a + b}}</p>`)).toThrow(
      '[ADX] structure.adx:1 - Unsupported expression "a + b"',
    );
  });

  it("duplicate attribute binding", () => {
    expect(() => parse(`<img :src="a" :src="b">`)).toThrow(
      '[ADX] structure.adx:1 - Duplicate attribute ":src"',
    );
  });

  it(":if and :else on the same element", () => {
    expect(() => parse(`<p :if="a" :else>x</p>`)).toThrow(
      '[ADX] structure.adx:1 - ":if" and ":else" on the same element',
    );
  });
});
