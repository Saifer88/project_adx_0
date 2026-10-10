import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { parseStructure } from "../src/structure/parser.js";
import { emitHtml } from "../src/codegen/html.js";
import { emitGlue } from "../src/codegen/glue.js";
import { scanBehavior } from "../src/behavior/scan.js";
import { scopeId } from "../src/codegen/scope.js";
import { loadTokens } from "../src/tokens/load.js";
import type { CodegenContext } from "../src/codegen/context.js";
import type { Manifest } from "../src/manifest/types.js";
import { tokensPath, fixtureDir } from "./helpers.js";

/**
 * Phase 4 reactivity (DOM): emit the glue for a structure+behavior, run it
 * under jsdom, dispatch a wired event, and assert ONLY state-backed text/attrs
 * patch — computed-backed and :for runs are left frozen.
 */

const SCOPE_LOC = "reactive";

/** Build a CodegenContext for a given behavior source + build-time state. */
function makeReactiveCtx(
  behaviorSrc: string,
  state: Record<string, unknown>,
  computed: Record<string, unknown> = {},
): CodegenContext {
  const manifest: Manifest = {
    name: "Reactive",
    version: "1.0.0",
    props: {},
    emits: [],
    slots: [],
    deps: [],
  };
  return {
    componentName: manifest.name,
    scopeId: scopeId(manifest.name, SCOPE_LOC),
    scope: { state, props: state, computed },
    tokens: loadTokens(tokensPath),
    behavior: scanBehavior(behaviorSrc, "behavior.adx.js"),
    manifest,
    mergedProps: state,
    instanceIndex: 0,
    absDir: fixtureDir,
  };
}

describe("reactivity (jsdom) — handler return patches hooked nodes", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-react-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    const g = globalThis as Record<string, unknown>;
    delete g.document;
    delete g.CustomEvent;
    delete g.__ADX_PROPS__;
    delete g.emit;
  });

  /** Compile src+behavior, run the glue in jsdom, return the document. */
  async function hydrate(
    src: string,
    behaviorSrc: string,
    state: Record<string, unknown>,
    computed: Record<string, unknown> = {},
  ): Promise<Document> {
    const ctx = makeReactiveCtx(behaviorSrc, state, computed);
    const { html, hooks } = emitHtml(parseStructure(src, "structure.adx"), ctx);
    // emitGlue imports from "./behavior.js" — write the sidecar beside the glue.
    const glue = emitGlue(hooks, ctx);

    const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
    const g = globalThis as Record<string, unknown>;
    g.document = dom.window.document;
    g.CustomEvent = dom.window.CustomEvent;
    g.__ADX_PROPS__ = {};

    writeFileSync(join(dir, "behavior.js"), behaviorSrc, "utf8");
    writeFileSync(join(dir, "glue.js"), glue, "utf8");
    await import(
      pathToFileURL(join(dir, "glue.js")).href + `?t=${Date.now()}`
    );
    return dom.window.document;
  }

  it("live-patches a state-backed {{count}} after a handler mutates state", async () => {
    const behaviorSrc =
      "export function setup(){return {count: 0}} " +
      "export function onInc(state){state.count = state.count + 1}";
    const src = '<button @inc="onInc">{{count}}</button>';
    const doc = await hydrate(src, behaviorSrc, { count: 0 });

    const btn = doc.querySelector("button")!;
    expect(btn.textContent).toBe("0"); // build-time value, unchanged on load

    btn.dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "inc",
      ),
    );
    expect(btn.textContent).toBe("1");

    btn.dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "inc",
      ),
    );
    expect(btn.textContent).toBe("2");
  });

  it("live-patches a state-backed :src attribute", async () => {
    const behaviorSrc =
      "export function setup(){return {src: '/a.png'}} " +
      "export function onSwap(state){state.src = '/b.png'}";
    const src = '<img :src="src" @swap="onSwap">';
    const doc = await hydrate(src, behaviorSrc, { src: "/a.png" });

    const img = doc.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/a.png");

    img.dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "swap",
      ),
    );
    expect(img.getAttribute("src")).toBe("/b.png");
  });

  it("leaves a getDisplayName-backed <h2>{{displayName}}</h2> UNCHANGED (not blanked) after rerender", async () => {
    const behaviorSrc =
      "export function setup(){return {name: 'Ada', count: 0}} " +
      "export function getDisplayName(state){return state.name} " +
      "export function onInc(state){state.count = state.count + 1}";
    // The <h2> is computed-backed (frozen); the <span> count is state-backed.
    const src =
      '<article @inc="onInc"><h2>{{displayName}}</h2><span>{{count}}</span></article>';
    const doc = await hydrate(
      src,
      behaviorSrc,
      { name: "Ada", count: 0 },
      { displayName: "Ada" },
    );

    const article = doc.querySelector("article")!;
    const h2 = doc.querySelector("h2")!;
    const span = doc.querySelector("span")!;
    expect(h2.textContent).toBe("Ada");
    expect(span.textContent).toBe("0");

    // The @inc handler is on the article; dispatch there.
    article.dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "inc",
      ),
    );

    // Computed-backed <h2> keeps its build-time value (NOT blanked to "").
    expect(h2.textContent).toBe("Ada");
    // State-backed <span> updates.
    expect(span.textContent).toBe("1");
  });

  it("does not live-update a :for item on event (no structural reactivity)", async () => {
    const behaviorSrc =
      "export function setup(){return {items: ['A','B'], n: 0}} " +
      "export function onBump(state){state.n = state.n + 1; state.items[0] = 'Z'}";
    const src =
      '<ul @bump="onBump"><li :for="(it, i) in items">{{it}}</li></ul>';
    const doc = await hydrate(src, behaviorSrc, { items: ["A", "B"], n: 0 });

    const ul = doc.querySelector("ul")!;
    const first = doc.querySelectorAll("li")[0];
    expect(first.textContent).toBe("A");

    ul.dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "bump",
      ),
    );

    // The :for item is build-time frozen — unchanged even though state.items
    // mutated.
    expect(first.textContent).toBe("A");
  });
});
