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
    expect(glue).toContain("export { state, props };");
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
    expect(glue).toContain("document.querySelector(");
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
