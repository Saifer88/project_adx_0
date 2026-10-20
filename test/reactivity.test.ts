import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { parseStructure } from "../src/structure/parser.js";
import { emitHtml } from "../src/codegen/html.js";
import { emitComponentGlue } from "../src/codegen/glue.js";
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
    state: Record<string, unknown> | Record<string, unknown>[],
    computed: Record<string, unknown> | Record<string, unknown>[] = {},
  ): Promise<Document> {
    const states = Array.isArray(state) ? state : [state];
    // `computed` may be a single object (shared) or one per instance (parallel
    // to `states`), so each instance can bake its own build-time computed value.
    const computedFor = (index: number): Record<string, unknown> =>
      Array.isArray(computed) ? computed[index] ?? {} : computed;
    const instances = states.map((value, instanceIndex) => {
      const ctx = makeReactiveCtx(behaviorSrc, value, computedFor(instanceIndex));
      ctx.instanceIndex = instanceIndex;
      return { ctx, ...emitHtml(parseStructure(src, "structure.adx"), ctx) };
    });
    const ctx = instances[0].ctx;
    const html = instances.map((instance) => instance.html).join("");
    const glue = emitComponentGlue({
      absDir: ctx.absDir,
      scopeId: ctx.scopeId,
      componentName: ctx.componentName,
      css: "",
      hooks: instances[0].hooks,
      instances: instances.map((instance) => ({
        instanceIndex: instance.ctx.instanceIndex,
        props: instance.ctx.mergedProps,
        hooks: instance.hooks,
      })),
    });

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

  it("keeps state and conditional hooks independent for each instance", async () => {
    const doc = await hydrate(
      '<div><span :if="show">{{label}}</span><button @click="onInc">{{count}}</button></div>',
      'export function setup(props){return {...props}} export function onInc(state){state.count++}',
      [{ show: false, label: "First", count: 0 }, { show: true, label: "Second", count: 10 }],
    );
    const buttons = doc.querySelectorAll("button");
    buttons[0].click();
    expect(buttons[0].textContent).toBe("1");
    expect(buttons[1].textContent).toBe("10");
    buttons[1].click();
    expect(buttons[1].textContent).toBe("11");
    expect(doc.querySelector("span")!.textContent).toBe("Second");
  });

  it("wires all roots of a fragment", async () => {
    const doc = await hydrate(
      '<span>{{count}}</span><button @click="onInc">{{count}}</button>',
      'export function setup(props){return {...props}} export function onInc(state){state.count++}',
      { count: 0 },
    );
    doc.querySelector("button")!.click();
    expect(doc.querySelector("span")!.textContent).toBe("1");
    expect(doc.querySelector("button")!.textContent).toBe("1");
  });

  it("preserves nested loop text after events", async () => {
    const doc = await hydrate(
      '<ul @click="onInc"><li :for="item in items"><span>{{item}}</span></li></ul>',
      'export function setup(props){return {...props}} export function onInc(state){state.items[0]="Changed"}',
      { items: ["A", "B"] },
    );
    doc.querySelector("ul")!.click();
    expect(Array.from(doc.querySelectorAll("span"), (span) => span.textContent)).toEqual(["A", "B"]);
  });

  it("handles boolean attributes and dirty form properties", async () => {
    const doc = await hydrate(
      '<div><input type="checkbox" :checked="active"><input :value="name"><button :disabled="active" aria-pressed="false" @click="onToggle">Toggle</button></div>',
      'export function setup(props){return {...props}} export function onToggle(state){state.active=true;state.name="updated"}',
      { active: false, name: "initial" },
    );
    const checkbox = doc.querySelector('input[type="checkbox"]') as HTMLInputElement;
    const input = doc.querySelector('input:not([type])') as HTMLInputElement;
    const button = doc.querySelector("button")!;
    expect(checkbox.checked).toBe(false);
    expect(button.disabled).toBe(false);
    checkbox.checked = true;
    checkbox.checked = false;
    input.value = "edited";
    button.click();
    expect(checkbox.checked).toBe(true);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(input.value).toBe("updated");
  });

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

  it("live-updates a getDisplayName-backed <h2>{{displayName}}</h2> after the handler mutates its source state", async () => {
    // FEAT-001 INTENTIONAL CHANGE (was a freeze test): a single bare computed
    // interpolation now re-evaluates via its imported getter on handler return.
    const behaviorSrc =
      "export function setup(props){return {...props}} " +
      "export function getDisplayName(state){return state.name.toUpperCase()} " +
      "export function onRename(state){state.name = 'Grace'}";
    // The <h2> is computed-backed (now live); the <span> label is state-backed.
    const src =
      '<article @rename="onRename"><h2>{{displayName}}</h2><span>{{name}}</span></article>';
    const doc = await hydrate(src, behaviorSrc, { name: "Ada" }, { displayName: "ADA" });

    const article = doc.querySelector("article")!;
    const h2 = doc.querySelector("h2")!;
    const span = doc.querySelector("span")!;
    // Build-time static value (SEO static-first): getter already ran at build.
    expect(h2.textContent).toBe("ADA");
    expect(span.textContent).toBe("Ada");

    // The @rename handler is on the article; dispatch there.
    article.dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "rename",
      ),
    );

    // Computed-backed <h2> re-evaluates getDisplayName over the mutated state.
    expect(h2.textContent).toBe("GRACE");
    // State-backed <span> updates too.
    expect(span.textContent).toBe("Grace");
  });

  it("updates a computed <h2> for the clicked instance ONLY (per-instance isolation)", async () => {
    const behaviorSrc =
      "export function setup(props){return {...props}} " +
      "export function getDisplayName(state){return state.name.toUpperCase()} " +
      "export function onRename(state){state.name = 'Grace'}";
    const src = '<article @rename="onRename"><h2>{{displayName}}</h2></article>';
    const doc = await hydrate(
      src,
      behaviorSrc,
      [{ name: "Ada" }, { name: "Linus" }],
      [{ displayName: "ADA" }, { displayName: "LINUS" }],
    );

    const articles = doc.querySelectorAll("article");
    const headings = doc.querySelectorAll("h2");
    expect(headings[0].textContent).toBe("ADA");
    expect(headings[1].textContent).toBe("LINUS");

    // Rename only the first instance.
    articles[0].dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "rename",
      ),
    );

    expect(headings[0].textContent).toBe("GRACE");
    // The second instance's computed node is untouched (own state preserved).
    expect(headings[1].textContent).toBe("LINUS");
  });

  it("live-updates a computed :title=\"displayName\" attribute after a handler", async () => {
    const behaviorSrc =
      "export function setup(props){return {...props}} " +
      "export function getDisplayName(state){return state.name.toUpperCase()} " +
      "export function onRename(state){state.name = 'Grace'}";
    const src = '<article :title="displayName" @rename="onRename">x</article>';
    const doc = await hydrate(src, behaviorSrc, { name: "Ada" }, { displayName: "ADA" });

    const article = doc.querySelector("article")!;
    expect(article.getAttribute("title")).toBe("ADA");

    article.dispatchEvent(
      new (globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent(
        "rename",
      ),
    );

    expect(article.getAttribute("title")).toBe("GRACE");
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
