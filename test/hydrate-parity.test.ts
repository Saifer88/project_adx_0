import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { compileComponent } from "../src/compile.js";
import { fixtureDir, tokensPath } from "./helpers.js";

/**
 * Hydration-parity contract (design Phase 1, HIGH-1): the pre-JS static HTML
 * must equal the post-hydration DOM before any event is dispatched. We compile
 * the fixture with `--data`, render the HTML into jsdom, run the emitted glue
 * module, and assert the DOM text/attributes are unchanged.
 */
describe("hydration parity — glue leaves the DOM unchanged before events", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-hydrate-"));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
    delete (globalThis as Record<string, unknown>).document;
    delete (globalThis as Record<string, unknown>).CustomEvent;
    delete (globalThis as Record<string, unknown>).__ADX_PROPS__;
    delete (globalThis as Record<string, unknown>).emit;
  });

  it("does not alter the rendered content on load", async () => {
    const { html, glue } = compileComponent(fixtureDir, {
      tokensPath,
      data: { name: "Ada Lovelace" },
    });

    // Render the static document into jsdom.
    const dom = new JSDOM(html);
    const g = globalThis as Record<string, unknown>;
    g.document = dom.window.document;
    g.CustomEvent = dom.window.CustomEvent;
    g.__ADX_PROPS__ = {};

    const main = dom.window.document.querySelector("main")!;
    const before = main.innerHTML;

    // Write glue + behavior so the glue's `import "./behavior.js"` resolves,
    // then import the glue as a real ES module.
    const behaviorSrc = readFileSync(
      join(fixtureDir, "behavior.adx.js"),
      "utf8",
    );
    writeFileSync(join(dir, "behavior.js"), behaviorSrc, "utf8");
    writeFileSync(join(dir, "glue.js"), glue, "utf8");

    const mod = await import(pathToFileURL(join(dir, "glue.js")).href);

    // Glue ran setup() and wired events; the DOM must be byte-identical.
    expect(main.innerHTML).toBe(before);
    // The baked props equal the merged props the HTML was built from.
    expect(mod.props.name).toBe("Ada Lovelace");
    expect(mod.state.name).toBe("Ada Lovelace");
    // The static HTML already carried the resolved name.
    expect(before).toContain("Ada Lovelace");
  });
});
