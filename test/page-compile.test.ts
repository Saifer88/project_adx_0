import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compilePage, checkPage } from "../src/page/compile.js";
import { siteDir, tokensPath } from "./helpers.js";

const opts = { tokensPath };

describe("compilePage — two-page fixture site", () => {
  const index = compilePage(join(siteDir, "index.json"), opts);
  const about = compilePage(join(siteDir, "about.json"), opts);

  it("resolves all content with zero {{ left", () => {
    expect(index.html).not.toContain("{{");
    expect(about.html).not.toContain("{{");
  });

  it("concatenates component bodies in DOM order inside one <main>", () => {
    expect(index.html).toContain("<main>");
    // site-header appears before user-card (manifest order).
    const headerAt = index.html.indexOf("ADX Demo");
    const cardAt = index.html.indexOf("Ada Lovelace");
    expect(headerAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(headerAt);
  });

  it("renders each instance's resolved content", () => {
    expect(index.html).toMatch(/<h2[^>]*>Ada Lovelace<\/h2>/);
    expect(index.html).toContain("Current page: home");
    expect(about.html).toMatch(/<h2[^>]*>Grace Hopper<\/h2>/);
    expect(about.html).toContain("Current page: about");
  });

  it("emits the per-page title/description", () => {
    expect(index.html).toContain("<title>ADX Demo — Home</title>");
    expect(index.html).toContain(
      '<meta name="description" content="The home page of the ADX two-page demo site." />',
    );
    expect(about.html).toContain("<title>About us</title>");
    expect(about.html).toContain(
      '<meta name="description" content="Who we are and what ADX is." />',
    );
  });

  it("derives the correct per-page canonical from the slug", () => {
    // index/home -> root canonical.
    expect(index.html).toContain('<link rel="canonical" href="/" />');
    // explicit canonical on the about page.
    expect(about.html).toContain('<link rel="canonical" href="/about/" />');
  });

  it("sets <html lang> per page", () => {
    expect(index.html).toContain('<html lang="en">');
    expect(about.html).toContain('<html lang="en">');
  });

  it("emits page JSON-LD with @type == schema and name == title", () => {
    const indexLd = JSON.parse(
      /<script type="application\/ld\+json">(.*?)<\/script>/.exec(index.html)![1],
    );
    expect(indexLd["@type"]).toBe("WebPage");
    expect(indexLd.name).toBe("ADX Demo — Home");

    const aboutLd = JSON.parse(
      /<script type="application\/ld\+json">(.*?)<\/script>/.exec(about.html)![1],
    );
    expect(aboutLd["@type"]).toBe("AboutPage");
    expect(aboutLd.name).toBe("About us");
  });

  it("unions each distinct component's scoped CSS and emits sidecar assets", () => {
    expect(index.css).toContain('[data-adx-c="');
    // two distinct components used -> two glue sidecars.
    const stems = index.components.map((c) => c.stem).sort();
    expect(stems).toEqual(["site-header", "user-card"]);
    // page entry imports each component's module.
    expect(index.glue).toContain('import "./site-header.glue.js";');
    expect(index.glue).toContain('import "./user-card.glue.js";');
  });
});

describe("compilePage — JSON-LD omitted when schema absent", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-page-"));
    const page = {
      page: "plain",
      title: "Plain",
      description: "No schema here.",
      // Point `use` at the real fixture via an absolute path for determinism.
      components: [{ use: join(siteDir, "..", "user-card"), data: { name: "X" } }],
    };
    writeFileSync(join(dir, "plain.json"), JSON.stringify(page), "utf8");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("emits no JSON-LD block when page.schema is absent", () => {
    const { html } = compilePage(join(dir, "plain.json"), opts);
    expect(html).not.toContain("application/ld+json");
  });
});

describe("compilePage — Component not found", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-page-"));
    const page = {
      page: "broken",
      title: "Broken",
      description: "Bad use path.",
      components: [{ use: "./nope" }],
    };
    writeFileSync(join(dir, "broken.json"), JSON.stringify(page), "utf8");
    // A `use` pointing at a .json file is also "not found".
    const page2 = {
      page: "broken2",
      title: "Broken2",
      description: "Points at a json file.",
      components: [{ use: "./broken.json" }],
    };
    writeFileSync(join(dir, "broken2.json"), JSON.stringify(page2), "utf8");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("fails when a use points at a missing component dir", () => {
    expect(() => compilePage(join(dir, "broken.json"), opts)).toThrow(
      `[ADX] ${join(dir, "broken.json")} - Component not found: "./nope"`,
    );
  });

  it("fails when a use points at a .json file", () => {
    expect(() => compilePage(join(dir, "broken2.json"), opts)).toThrow(
      `[ADX] ${join(dir, "broken2.json")} - Component not found: "./broken.json"`,
    );
  });
});

describe("checkPage — required-prop validation per instance (MEDIUM-6)", () => {
  const valid = { tokensPath };

  it("passes when every instance's required props are supplied", () => {
    expect(() => checkPage(join(siteDir, "index.json"), valid)).not.toThrow();
  });

  it("fails with the child's page-sourced Missing required prop error", () => {
    // Build a page whose user-card instance omits the required `name`.
    const dir = mkdtempSync(join(tmpdir(), "adx-page-"));
    try {
      const page = {
        page: "missing",
        title: "Missing",
        description: "A required prop is unsupplied.",
        components: [{ use: join(siteDir, "..", "user-card"), data: {} }],
      };
      writeFileSync(join(dir, "missing.json"), JSON.stringify(page), "utf8");
      expect(() => checkPage(join(dir, "missing.json"), valid)).toThrow(
        '[ADX] manifest.json - Missing required prop "name" (no default and no value in the page\'s component data)',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
