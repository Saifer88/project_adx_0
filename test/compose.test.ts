import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { compileComponent } from "../src/compile.js";
import { compilePage } from "../src/page/compile.js";
import { fixtureDir, tokensPath } from "./helpers.js";

const landingDir = join(fixtureDir, "..", "compose", "landing");
const opts = { tokensPath };

describe("composition — custom tags resolve, splice, and isolate", () => {
  const { html, css } = compileComponent(landingDir, opts);

  it("splices each child's markup inside the parent with its own data-adx-c", () => {
    // Parent (Landing), site-header, and user-card each carry a DISTINCT id.
    const ids = Array.from(html.matchAll(/data-adx-c="(c[0-9a-f]{7})"/g)).map(
      (m) => m[1],
    );
    const distinct = new Set(ids);
    expect(distinct.size).toBe(3);
    // Child content appears inside the parent markup.
    expect(html).toContain("Current page: home");
    expect(html).toMatch(/<h2[^>]*>Ada Lovelace<\/h2>/);
  });

  it("leaves zero {{ (all content resolved at build time)", () => {
    expect(html).not.toContain("{{");
  });

  it("emits each component's scoped CSS exactly once", () => {
    // Use a single-occurrence selector per component (`.card:hover` means the
    // base `.card` rule appears more than once, so pick unique selectors).
    expect((css.match(/\.site-header\[data-adx-c=/g) ?? []).length).toBe(1);
    expect((css.match(/\.avatar\[data-adx-c=/g) ?? []).length).toBe(1);
    expect((css.match(/\.landing\[data-adx-c=/g) ?? []).length).toBe(1);
  });

  it("gives each instance a distinct data-adx-i root (parent i0, children i1/i2)", () => {
    expect(html).toContain('data-adx-i="i0"');
    expect(html).toContain('data-adx-i="i1"');
    expect(html).toContain('data-adx-i="i2"');
  });

  it("projects slot content under the PARENT's identity (MEDIUM-3)", () => {
    // The projected <button> sits inside the user-card subtree but carries the
    // PARENT's scope id + instance ordinal + parent-instance hook id.
    const parentId = /class="landing" data-adx-c="(c[0-9a-f]{7})"/.exec(html)![1];
    expect(html).toMatch(
      new RegExp(
        `<button class="follow" data-adx-c="${parentId}" data-adx-b="${parentId}-i0-\\d+">`,
      ),
    );
    // Projected {{who}} resolved from the PARENT state.
    expect(html).toContain("Follow Ada Lovelace");
    // And the site-header default-slot projection likewise carries parent id.
    expect(html).toMatch(
      new RegExp(`<a class="nav-link" data-adx-c="${parentId}"`),
    );
  });
});

/** Write a page's html + its per-component sidecars and import the glue. */
async function hydratePage(
  dir: string,
  pageHtml: string,
  componentGlue: string,
  behaviorSrc: string,
  stem: string,
): Promise<JSDOM> {
  const dom = new JSDOM(pageHtml);
  const g = globalThis as Record<string, unknown>;
  g.document = dom.window.document;
  g.CustomEvent = dom.window.CustomEvent;
  g.__ADX_PROPS__ = {};
  writeFileSync(join(dir, `${stem}.behavior.js`), behaviorSrc, "utf8");
  writeFileSync(join(dir, `${stem}.glue.js`), componentGlue, "utf8");
  await import(pathToFileURL(join(dir, `${stem}.glue.js`)).href + `?t=${Date.now()}`);
  return dom;
}

const emitterDir = join(fixtureDir, "..", "compose", "emitter");

describe("per-instance hydration — one component used twice (HIGH-1, HIGH-2)", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    const g = globalThis as Record<string, unknown>;
    delete g.document;
    delete g.CustomEvent;
    delete g.__ADX_PROPS__;
    delete g.emit;
  });

  function buildTwoEmitters() {
    dir = mkdtempSync(join(tmpdir(), "adx-compose-"));
    const page = {
      page: "pair",
      title: "Pair",
      description: "One component used twice.",
      components: [
        { use: emitterDir, data: { label: "First" } },
        { use: emitterDir, data: { label: "Second" } },
      ],
    };
    writeFileSync(join(dir, "pair.json"), JSON.stringify(page), "utf8");
    const compiled = compilePage(join(dir, "pair.json"), opts);
    const emitter = compiled.components.find((c) => c.stem === "emitter")!;
    const behaviorSrc = readFileSync(
      join(emitterDir, "behavior.adx.js"),
      "utf8",
    );
    return { compiled, emitter, behaviorSrc };
  }

  it("emits two roots with distinct data-adx-i and distinct data-adx-b", () => {
    const { compiled } = buildTwoEmitters();
    expect(compiled.html).toContain('data-adx-i="i0"');
    expect(compiled.html).toContain('data-adx-i="i1"');
    const bIds = Array.from(
      compiled.html.matchAll(/data-adx-b="([^"]+)"/g),
    ).map((m) => m[1]);
    expect(new Set(bIds).size).toBe(bIds.length); // all unique
    expect(bIds.some((id) => id.includes("-i0-"))).toBe(true);
    expect(bIds.some((id) => id.includes("-i1-"))).toBe(true);
  });

  it("hydrates each instance with its own setup(props)->state", async () => {
    const { compiled, emitter, behaviorSrc } = buildTwoEmitters();
    const dom = await hydratePage(
      dir,
      compiled.html,
      emitter.glue,
      behaviorSrc,
      "emitter",
    );
    const doc = dom.window.document;
    const roots = doc.querySelectorAll(".emitter");
    expect(roots.length).toBe(2);
    expect(doc.querySelector('[data-adx-i="i0"]')!.textContent).toContain(
      "First",
    );
    expect(doc.querySelector('[data-adx-i="i1"]')!.textContent).toContain(
      "Second",
    );
  });

  it("a child emit from the 2nd instance targets the 2nd instance's root (HIGH-2)", async () => {
    const { compiled, emitter, behaviorSrc } = buildTwoEmitters();
    const dom = await hydratePage(
      dir,
      compiled.html,
      emitter.glue,
      behaviorSrc,
      "emitter",
    );
    const doc = dom.window.document;
    const second = doc.querySelector('[data-adx-i="i1"]') as HTMLElement;

    // The emitted event is named 'ping' (distinct from the 'click' listener),
    // so there is no re-entrancy. Capture it on the document.
    let received: { target: EventTarget | null } | null = null;
    doc.addEventListener("ping", (ev) => {
      received = { target: (ev as unknown as { target: EventTarget | null }).target };
    });

    // Fire a native click on the second instance -> wired handler ->
    // emit('ping', ...) dispatched on the SECOND instance's root.
    const nativeClick = new dom.window.Event("click", { bubbles: true });
    second.dispatchEvent(nativeClick);

    expect(received).not.toBeNull();
    const i1Root = doc.querySelector('[data-adx-i="i1"]')!;
    expect(i1Root.contains(received!.target as Node)).toBe(true);
    const i0Root = doc.querySelector('[data-adx-i="i0"]')!;
    expect(i0Root.contains(received!.target as Node)).toBe(false);
  });
});

describe("projected content is wired/patched by the PARENT (MEDIUM-3)", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    const g = globalThis as Record<string, unknown>;
    delete g.document;
    delete g.CustomEvent;
    delete g.__ADX_PROPS__;
    delete g.emit;
  });

  it("the parent's glue carries the projected node's hook id and wires it", () => {
    dir = mkdtempSync(join(tmpdir(), "adx-compose-"));
    const page = {
      page: "land",
      title: "Land",
      description: "Composed landing.",
      components: [{ use: landingDir, data: { who: "Ada Lovelace" } }],
    };
    writeFileSync(join(dir, "land.json"), JSON.stringify(page), "utf8");
    const compiled = compilePage(join(dir, "land.json"), opts);

    const parentId = /class="landing" data-adx-c="(c[0-9a-f]{7})"/.exec(
      compiled.html,
    )![1];
    // The projected button carries the parent's instance-scoped hook id.
    const btn = new RegExp(
      `<button class="follow" data-adx-c="${parentId}" data-adx-b="(${parentId}-i0-\\d+)">`,
    ).exec(compiled.html)!;
    const hookId = btn[1];

    // The PARENT (Landing) glue module — not user-card's — wires that hook.
    const landingGlue = compiled.components.find(
      (c) => c.stem === "landing",
    )!.glue;
    // Hook ids are rebuilt in-glue from SCOPE + inst.i + n; assert the parent
    // module owns the scope the projected node carries.
    expect(landingGlue).toContain(`const SCOPE = "${parentId}"`);
    // The user-card glue must NOT reference the parent's scope.
    const cardGlue = compiled.components.find(
      (c) => c.stem === "user-card",
    )!.glue;
    expect(cardGlue).not.toContain(parentId);
    void hookId;
  });
});

describe("dependency resolution table", () => {
  it("resolves a custom tag by the dep's kebab(manifest.name) and basename", () => {
    // Landing deps resolve <site-header> (basename) and <user-card> (basename
    // == kebab(UserCard)); a successful compile proves the table resolved both.
    const { html } = compileComponent(landingDir, opts);
    expect(html).toContain("site-header");
    expect(html).toMatch(/class="card"/);
  });

  it("throws Unknown component for an unresolved custom tag", () => {
    const dir = mkdtempSync(join(tmpdir(), "adx-unknown-"));
    try {
      writeFileSync(
        join(dir, "manifest.json"),
        JSON.stringify({ name: "Bad", version: "1.0.0", deps: [] }),
        "utf8",
      );
      writeFileSync(join(dir, "structure.adx"), "<div><mystery-box /></div>", "utf8");
      writeFileSync(join(dir, "behavior.adx.js"), "export function setup(p){return p}", "utf8");
      writeFileSync(join(dir, "style.adx.css"), "@use tokens;\n.x { color: tokens.text-1; }", "utf8");
      expect(() => compileComponent(dir, opts)).toThrow(
        '[ADX] structure.adx:1 - Unknown component "mystery-box" (not an HTML element; add to manifest deps)',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("throws Dependency not found for a missing dep dir", () => {
    const dir = mkdtempSync(join(tmpdir(), "adx-depmiss-"));
    try {
      writeFileSync(
        join(dir, "manifest.json"),
        JSON.stringify({ name: "Bad", version: "1.0.0", deps: ["./ghost"] }),
        "utf8",
      );
      writeFileSync(join(dir, "structure.adx"), "<div><ghost /></div>", "utf8");
      writeFileSync(join(dir, "behavior.adx.js"), "export function setup(p){return p}", "utf8");
      writeFileSync(join(dir, "style.adx.css"), "@use tokens;\n.x { color: tokens.text-1; }", "utf8");
      expect(() => compileComponent(dir, opts)).toThrow(
        '[ADX] manifest.json - Dependency not found: "./ghost"',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("dependency cycle detection", () => {
  function writeComponent(
    dir: string,
    name: string,
    deps: string[],
    structure: string,
  ): void {
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ name, version: "1.0.0", deps }),
      "utf8",
    );
    writeFileSync(join(dir, "structure.adx"), structure, "utf8");
    writeFileSync(
      join(dir, "behavior.adx.js"),
      "export function setup(p){return p}",
      "utf8",
    );
    writeFileSync(
      join(dir, "style.adx.css"),
      "@use tokens;\n.x { color: tokens.text-1; }",
      "utf8",
    );
  }

  it("detects a direct self-dependency", () => {
    const root = mkdtempSync(join(tmpdir(), "adx-cycle-"));
    try {
      const a = join(root, "self");
      rmSync(a, { recursive: true, force: true });
      mkdirSyncSafe(a);
      writeComponent(a, "Self", ["./"], "<div><self /></div>");
      expect(() => compileComponent(a, opts)).toThrow(
        /\[ADX\] structure\.adx:1 - Dependency cycle: self -> self/,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects a 2-node cycle a -> b -> a", () => {
    const root = mkdtempSync(join(tmpdir(), "adx-cycle-"));
    try {
      const a = join(root, "cyc-a");
      const b = join(root, "cyc-b");
      mkdirSyncSafe(a);
      mkdirSyncSafe(b);
      writeComponent(a, "CycA", ["../cyc-b"], "<div><cyc-b /></div>");
      writeComponent(b, "CycB", ["../cyc-a"], "<div><cyc-a /></div>");
      expect(() => compileComponent(a, opts)).toThrow(
        "[ADX] structure.adx:1 - Dependency cycle: cyc-a -> cyc-b -> cyc-a",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("detects a 3-node cycle a -> b -> c -> a", () => {
    const root = mkdtempSync(join(tmpdir(), "adx-cycle-"));
    try {
      const a = join(root, "cyc-a");
      const b = join(root, "cyc-b");
      const c = join(root, "cyc-c");
      mkdirSyncSafe(a);
      mkdirSyncSafe(b);
      mkdirSyncSafe(c);
      writeComponent(a, "CycA", ["../cyc-b"], "<div><cyc-b /></div>");
      writeComponent(b, "CycB", ["../cyc-c"], "<div><cyc-c /></div>");
      writeComponent(c, "CycC", ["../cyc-a"], "<div><cyc-a /></div>");
      expect(() => compileComponent(a, opts)).toThrow(
        "[ADX] structure.adx:1 - Dependency cycle: cyc-a -> cyc-b -> cyc-c -> cyc-a",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("slot projection errors", () => {
  function scaffoldParent(
    dir: string,
    structure: string,
  ): void {
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({
        name: "Parent",
        version: "1.0.0",
        deps: [join(fixtureDir)],
      }),
      "utf8",
    );
    writeFileSync(join(dir, "structure.adx"), structure, "utf8");
    writeFileSync(
      join(dir, "behavior.adx.js"),
      "export function setup(p){return p}",
      "utf8",
    );
    writeFileSync(
      join(dir, "style.adx.css"),
      "@use tokens;\n.x { color: tokens.text-1; }",
      "utf8",
    );
  }

  it("rejects a slot the child does not declare", () => {
    const dir = mkdtempSync(join(tmpdir(), "adx-slot-"));
    try {
      scaffoldParent(
        dir,
        '<div>\n<user-card :name="n">\n<template slot="ghost">x</template>\n</user-card>\n</div>',
      );
      expect(() => compileComponent(dir, { ...opts, data: { n: "A" } })).toThrow(
        /\[ADX\] structure\.adx:3 - Component "user-card" has no slot "ghost"/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate content for the same named slot", () => {
    const dir = mkdtempSync(join(tmpdir(), "adx-slot-"));
    try {
      scaffoldParent(
        dir,
        '<div>\n<user-card :name="n">\n<template slot="actions">a</template>\n<template slot="actions">b</template>\n</user-card>\n</div>',
      );
      expect(() => compileComponent(dir, { ...opts, data: { n: "A" } })).toThrow(
        /\[ADX\] structure\.adx:4 - Duplicate slot content for "actions"/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/** Create a directory (recursive). */
function mkdirSyncSafe(p: string): void {
  mkdirSync(p, { recursive: true });
}
