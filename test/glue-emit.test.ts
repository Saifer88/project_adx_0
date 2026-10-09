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

describe("emitGlue", () => {
  it("emits a valid ES module importing behavior exports", () => {
    const { glue } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain("import { setup, onClick } from \"./behavior.js\";");
    expect(glue).toContain("export { state, props };");
  });

  it("calls setup once and selects existing DOM by scope hooks", () => {
    const { glue, ctx } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain("setup(props)");
    expect(glue).toContain(`const SCOPE = "${ctx.scopeId}"`);
    expect(glue).toContain("document.querySelector('[data-adx-c=\"' + SCOPE");
    expect(glue).toContain(`byHook("${ctx.scopeId}-0")`);
  });

  it("wires each @event to its handler receiving (state, event)", () => {
    const { glue } = glueFor('<article @click="onClick"></article>');
    expect(glue).toContain(
      'el.addEventListener("click", (event) => onClick(state, event));',
    );
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
