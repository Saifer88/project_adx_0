import { describe, it, expect } from "vitest";
import { parseStructure } from "../src/structure/parser.js";
import { emitHtml } from "../src/codegen/html.js";
import { lowerExpr, rootIdent } from "../src/codegen/html.js";
import type { UpdateInstr } from "../src/codegen/html.js";
import { makeCtx } from "./helpers.js";

/** Emit the single hook for a one-element structure. */
function hookFor(
  src: string,
  overrides: Parameters<typeof makeCtx>[0] = {},
) {
  const ctx = makeCtx(overrides);
  const { hooks } = emitHtml(parseStructure(src, "structure.adx"), ctx);
  return hooks;
}

/** A behavior source exporting setup + a getDisplayName computed value. */
const computedBehavior =
  "export function setup(p){return p} " +
  "export function getDisplayName(s){return s.name} " +
  "export function onClick(){}";

describe("SerExpr lowering", () => {
  it("lowers a bare ident 1:1", () => {
    expect(lowerExpr({ kind: "ident", name: "count" })).toEqual({
      ident: "count",
    });
  });

  it("lowers a member chain 1:1", () => {
    const expr = {
      kind: "member" as const,
      object: { kind: "ident" as const, name: "user" },
      property: "name",
    };
    expect(lowerExpr(expr)).toEqual({ member: { ident: "user" }, prop: "name" });
  });

  it("rootIdent unwraps a member chain to its base ident", () => {
    expect(rootIdent({ ident: "x" })).toBe("x");
    expect(rootIdent({ member: { ident: "displayName" }, prop: "length" })).toBe(
      "displayName",
    );
    expect(
      rootIdent({
        member: { member: { ident: "user" }, prop: "a" },
        prop: "b",
      }),
    ).toBe("user");
  });
});

describe("emitter attaches update instructions", () => {
  it("attaches an attr update for :src", () => {
    const hooks = hookFor('<img :src="avatar">', {
      state: { avatar: "/a.png" },
    });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].updates).toEqual<UpdateInstr[]>([
      { kind: "attr", name: "src", expr: { ident: "avatar" } },
    ]);
  });

  it("attaches a text update for a single interpolated {{name}}", () => {
    const hooks = hookFor("<h2>{{name}}</h2>", { state: { name: "Ada" } });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].updates).toEqual<UpdateInstr[]>([
      { kind: "text", expr: { ident: "name" } },
    ]);
  });

  it("attaches an attrTemplate update for a mixed literal+hole attr", () => {
    const hooks = hookFor('<a :href="/u/{{slug}}">x</a>', {
      state: { slug: "ada" },
    });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].updates).toEqual<UpdateInstr[]>([
      {
        kind: "attrTemplate",
        name: "href",
        parts: [{ lit: "/u/" }, { expr: { ident: "slug" } }],
      },
    ]);
  });

  it("attaches a textTemplate update for mixed literal+hole text", () => {
    const hooks = hookFor("<p>Hi {{name}}!</p>", { state: { name: "Ada" } });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].updates).toEqual<UpdateInstr[]>([
      {
        kind: "textTemplate",
        parts: [{ lit: "Hi " }, { expr: { ident: "name" } }, { lit: "!" }],
      },
    ]);
  });

  it("gives an element with BOTH @event and state-backed {{count}} one hook with the event and a text update", () => {
    const hooks = hookFor('<button @click="onClick">{{count}}</button>', {
      state: { count: 3 },
    });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].events).toEqual([{ event: "click", handler: "onClick" }]);
    expect(hooks[0].updates).toEqual<UpdateInstr[]>([
      { kind: "text", expr: { ident: "count" } },
    ]);
  });

  it("gives a :for-unrolled element with an event an events-only hook (no text/attr updates)", () => {
    const src =
      '<ul><li :for="(t, i) in tags" @click="onClick">{{t.label}}</li></ul>';
    const hooks = hookFor(src, {
      state: {
        tags: [
          { id: 1, label: "A" },
          { id: 2, label: "B" },
        ],
      },
    });
    // Two unrolled list items, each a hook, each events-only.
    expect(hooks).toHaveLength(2);
    for (const h of hooks) {
      expect(h.events).toEqual([{ event: "click", handler: "onClick" }]);
      expect(h.updates).toEqual([]);
    }
  });
});

describe("computed-backed runs are frozen (HIGH-1)", () => {
  it("emits NO text update for a computed {{displayName}} while a state {{count}} DOES get one", () => {
    const src =
      '<div><h2>{{displayName}}</h2><span>{{count}}</span></div>';
    const hooks = hookFor(src, {
      state: { name: "Ada", count: 3 },
      behaviorSrc: computedBehavior,
    });
    // Both the <h2> and the <span> are hooked (single interpolated text runs).
    const h2Hook = hooks[0];
    const spanHook = hooks[1];
    // displayName is a getDisplayName computed -> frozen, no update.
    expect(h2Hook.updates).toEqual([]);
    // count is state-backed -> live text update.
    expect(spanHook.updates).toEqual<UpdateInstr[]>([
      { kind: "text", expr: { ident: "count" } },
    ]);
  });

  it("freezes a member chain {{displayName.foo}} rooted at a computed name", () => {
    const hooks = hookFor("<h2>{{displayName.foo}}</h2>", {
      state: { name: "Ada" },
      behaviorSrc: computedBehavior,
    });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].updates).toEqual([]);
  });

  it("freezes a mixed template when any hole roots in a computed name", () => {
    const hooks = hookFor("<p>{{displayName}} ({{count}})</p>", {
      state: { name: "Ada", count: 3 },
      behaviorSrc: computedBehavior,
    });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].updates).toEqual([]);
  });

  it("freezes a computed-backed :src attribute", () => {
    const hooks = hookFor('<img :src="displayName.url">', {
      state: { name: "Ada" },
      behaviorSrc: computedBehavior,
    });
    expect(hooks).toHaveLength(1);
    expect(hooks[0].updates).toEqual([]);
  });
});
