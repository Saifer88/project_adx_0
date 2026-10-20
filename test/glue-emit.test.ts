import { describe, it, expect } from "vitest";
import { parseStructure } from "../src/structure/parser.js";
import { emitHtml } from "../src/codegen/html.js";
import { emitGlue } from "../src/codegen/glue.js";
import { makeCtx } from "./helpers.js";

function glueFor(src: string) {
  const ctx = makeCtx();
  const { hooks } = emitHtml(parseStructure(src, "structure.adx"), ctx);
  return { glue: emitGlue(hooks, ctx), ctx };
}

describe("emitGlue (per-instance)", () => {
  it("emits a valid ES module importing behavior exports", () => {
    const { glue } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain("import { setup, onClick } from \"./behavior.js\";");
    expect(glue).toContain("export { lastState as state, lastProps as props };");
  });

  it("carries an INSTANCES array and loops per instance (one i0 here)", () => {
    const { glue, ctx } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain(`const SCOPE = "${ctx.scopeId}"`);
    expect(glue).toContain("const INSTANCES =");
    expect(glue).toContain('"i": "i0"');
    expect(glue).toContain("for (const inst of INSTANCES)");
    // Each instance builds its OWN state from its OWN props.
    expect(glue).toContain("state = setup(props)");
  });

  it("selects each instance's root by data-adx-c + data-adx-i", () => {
    const { glue } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain("document.querySelectorAll(");
    expect(glue).toContain("'[data-adx-c=\"' + SCOPE + '\"][data-adx-i=\"' + inst.i + '\"]'");
  });

  it("rebuilds instance-scoped hook ids within the instance root", () => {
    const { glue } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain("SCOPE + '-' + inst.i + '-' + n");
    expect(glue).toContain("root.querySelector(");
  });

  it("wires each @event via HANDLERS, exposing emit then rerendering", () => {
    const { glue } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain("const handler = HANDLERS[ev.handler];");
    expect(glue).toContain("globalThis.emit = emit;");
    expect(glue).toContain("handler(state, event);");
    expect(glue).toContain("rerender();");
  });

  it("never constructs DOM (no createElement, no vDOM import)", () => {
    const { glue } = glueFor(
      '<article @click="onClick"><img :src="avatar"></article>',
    );
    expect(glue).not.toContain("createElement");
    expect(glue).not.toContain("innerHTML");
    expect(glue).not.toMatch(/from\s+["']adx-runtime["']/);
  });
});

// FEAT-001: a single bare computed {{displayName}} only becomes live glue when
// a handler is wired. With NO wired @event the computed* instruction is dead
// weight, so it (and its getter import) are stripped — the glue stays
// byte-for-byte the pre-feature shape.
const computedBehavior =
  "export function setup(p){return p} " +
  "export function getDisplayName(s){return s.name} " +
  "export function onClick(){}";

describe("computed-only glue retains getters ONLY when a handler is wired (FEAT-001)", () => {
  it("drops the computed hook and getter import when no @event is wired", () => {
    const ctx = makeCtx({
      state: { name: "Ada" },
      behaviorSrc: computedBehavior,
    });
    const { hooks } = emitHtml(
      parseStructure("<h2>{{displayName}}</h2>", "structure.adx"),
      ctx,
    );
    const glue = emitGlue(hooks, ctx);
    // Pre-feature shape: only `setup` imported, no getter import, no GETTERS
    // map declaration, and the lone computed-only hook is dropped (no event ->
    // nothing to patch). The shared applyUpdate helper body is unchanged code.
    expect(glue).toContain('import { setup } from "./behavior.js";');
    expect(glue).not.toContain("getDisplayName");
    expect(glue).not.toContain("const GETTERS =");
    expect(glue).not.toContain('"kind": "computedText"');
    expect(glue).toContain('"hooks": []');
  });

  it("imports the getter and retains the computedText update when a handler is wired", () => {
    const ctx = makeCtx({
      state: { name: "Ada" },
      behaviorSrc: computedBehavior,
    });
    const { hooks } = emitHtml(
      parseStructure(
        '<article @click="onClick"><h2>{{displayName}}</h2></article>',
        "structure.adx",
      ),
      ctx,
    );
    const glue = emitGlue(hooks, ctx);
    expect(glue).toContain(
      'import { setup, onClick, getDisplayName } from "./behavior.js";',
    );
    expect(glue).toContain("const GETTERS = { getDisplayName: getDisplayName };");
    expect(glue).toContain('"kind": "computedText"');
    expect(glue).toContain('"get": "getDisplayName"');
  });
});
