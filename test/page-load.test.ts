import { describe, it, expect } from "vitest";
import { parsePage, loadPage } from "../src/page/load.js";

const FILE = "page.json";

function parse(obj: unknown) {
  return parsePage(JSON.stringify(obj), FILE);
}

const valid = {
  page: "about",
  title: "About us",
  description: "Who we are.",
  components: [{ use: "./comp" }],
};

describe("parsePage — valid manifests + defaults", () => {
  it("accepts a minimal valid manifest and applies defaults", () => {
    const p = parse(valid);
    expect(p.page).toBe("about");
    expect(p.lang).toBe("en"); // default
    expect(p.canonical).toBe("/about/"); // derived from slug
    expect(p.schema).toBeUndefined();
    expect(p.components).toHaveLength(1);
    expect(p.components[0].use).toBe("./comp");
  });

  it("maps index/home slugs to the root canonical", () => {
    expect(parse({ ...valid, page: "index" }).canonical).toBe("/");
    expect(parse({ ...valid, page: "home" }).canonical).toBe("/");
  });

  it("keeps an explicit lang/canonical/schema", () => {
    const p = parse({
      ...valid,
      lang: "fr",
      canonical: "/custom/",
      schema: "AboutPage",
    });
    expect(p.lang).toBe("fr");
    expect(p.canonical).toBe("/custom/");
    expect(p.schema).toBe("AboutPage");
  });

  it("accepts hyphenated multi-group slugs", () => {
    expect(parse({ ...valid, page: "our-team-2" }).page).toBe("our-team-2");
  });

  it("carries per-component data", () => {
    const p = parse({
      ...valid,
      components: [{ use: "./comp", data: { name: "Ada" } }],
    });
    expect(p.components[0].data).toEqual({ name: "Ada" });
  });
});

describe("parsePage — Phase 2 error table (exact strings)", () => {
  it("Invalid JSON", () => {
    expect(() => parsePage("{ not json", FILE)).toThrow(
      `[ADX] ${FILE} - Invalid JSON`,
    );
  });

  it("Missing required field \"page\"", () => {
    const { page: _omit, ...rest } = valid;
    void _omit;
    expect(() => parse(rest)).toThrow(
      `[ADX] ${FILE} - Missing required field "page"`,
    );
  });

  it("Missing required field \"title\"", () => {
    const { title: _omit, ...rest } = valid;
    void _omit;
    expect(() => parse(rest)).toThrow(
      `[ADX] ${FILE} - Missing required field "title"`,
    );
  });

  it("Missing required field \"description\"", () => {
    const { description: _omit, ...rest } = valid;
    void _omit;
    expect(() => parse(rest)).toThrow(
      `[ADX] ${FILE} - Missing required field "description"`,
    );
  });

  it("Missing required field \"components\"", () => {
    const { components: _omit, ...rest } = valid;
    void _omit;
    expect(() => parse(rest)).toThrow(
      `[ADX] ${FILE} - Missing required field "components"`,
    );
  });

  it("Invalid page slug (uppercase)", () => {
    expect(() => parse({ ...valid, page: "About" })).toThrow(
      `[ADX] ${FILE} - Invalid page slug "About" (lowercase, hyphenated)`,
    );
  });

  it("Invalid page slug (underscores)", () => {
    expect(() => parse({ ...valid, page: "a_b" })).toThrow(
      `[ADX] ${FILE} - Invalid page slug "a_b" (lowercase, hyphenated)`,
    );
  });

  it("empty components array", () => {
    expect(() => parse({ ...valid, components: [] })).toThrow(
      `[ADX] ${FILE} - "components" must list at least one component`,
    );
  });

  it("components not an array", () => {
    expect(() => parse({ ...valid, components: "nope" })).toThrow(
      `[ADX] ${FILE} - "components" must list at least one component`,
    );
  });

  it("a component missing its \"use\"", () => {
    expect(() => parse({ ...valid, components: [{ data: {} }] })).toThrow(
      `[ADX] ${FILE} - Missing required field "use"`,
    );
  });

  it("a non-object top-level maps to missing \"page\"", () => {
    expect(() => parsePage("[]", FILE)).toThrow(
      `[ADX] ${FILE} - Missing required field "page"`,
    );
  });
});

describe("loadPage — unreadable file", () => {
  it("Cannot read page manifest", () => {
    expect(() => loadPage("/no/such/page.json")).toThrow(
      `[ADX] /no/such/page.json - Cannot read page manifest`,
    );
  });
});

describe("parsePage — assets (valid + normalization)", () => {
  it("parses a full assets object and normalizes js shorthand to { src }", () => {
    const p = parse({
      ...valid,
      assets: {
        css: ["./tailwind.css", "https://cdn.example.com/lib.css"],
        js: [
          "./widget.js",
          { src: "./app.js", type: "module", defer: true, async: true },
        ],
        head: ['<meta name="theme-color" content="#1d4ed8" />'],
      },
    });
    expect(p.assets).toEqual({
      css: ["./tailwind.css", "https://cdn.example.com/lib.css"],
      js: [
        { src: "./widget.js" },
        { src: "./app.js", type: "module", defer: true, async: true },
      ],
      head: ['<meta name="theme-color" content="#1d4ed8" />'],
    });
  });

  it("omits assets entirely when absent", () => {
    expect(parse(valid).assets).toBeUndefined();
  });

  it("accepts a whitespace-only css href verbatim (no trim)", () => {
    const p = parse({ ...valid, assets: { css: ["  "] } });
    expect(p.assets).toEqual({ css: ["  "], js: [], head: [] });
  });

  it("accepts an empty-string head entry (head has no non-empty rule)", () => {
    const p = parse({ ...valid, assets: { head: [""] } });
    expect(p.assets).toEqual({ css: [], js: [], head: [""] });
  });
});

describe("parsePage — assets error table (exact strings)", () => {
  it('"assets" must be an object', () => {
    expect(() => parse({ ...valid, assets: [] })).toThrow(
      `[ADX] ${FILE} - "assets" must be an object`,
    );
    expect(() => parse({ ...valid, assets: "x" })).toThrow(
      `[ADX] ${FILE} - "assets" must be an object`,
    );
  });

  it('"assets.css" must be an array of strings', () => {
    expect(() => parse({ ...valid, assets: { css: "x" } })).toThrow(
      `[ADX] ${FILE} - "assets.css" must be an array of strings`,
    );
    expect(() => parse({ ...valid, assets: { css: [""] } })).toThrow(
      `[ADX] ${FILE} - "assets.css" must be an array of strings`,
    );
    expect(() => parse({ ...valid, assets: { css: [1] } })).toThrow(
      `[ADX] ${FILE} - "assets.css" must be an array of strings`,
    );
  });

  it('"assets.js" must be an array of scripts', () => {
    expect(() => parse({ ...valid, assets: { js: "x" } })).toThrow(
      `[ADX] ${FILE} - "assets.js" must be an array of scripts`,
    );
  });

  it("pinned js-entry classification: non-string/non-object entries", () => {
    for (const bad of [null, [], ["x"], 42, true]) {
      expect(() => parse({ ...valid, assets: { js: [bad] } })).toThrow(
        `[ADX] ${FILE} - Each "assets.js" entry must be a string or an object with "src"`,
      );
    }
  });

  it("js object (or empty shorthand) missing a string src", () => {
    expect(() => parse({ ...valid, assets: { js: [""] } })).toThrow(
      `[ADX] ${FILE} - Each "assets.js" entry must have a string "src"`,
    );
    expect(() => parse({ ...valid, assets: { js: [{ type: "module" }] } })).toThrow(
      `[ADX] ${FILE} - Each "assets.js" entry must have a string "src"`,
    );
    expect(() => parse({ ...valid, assets: { js: [{ src: "" }] } })).toThrow(
      `[ADX] ${FILE} - Each "assets.js" entry must have a string "src"`,
    );
  });

  it('"assets.js" type/defer/async type errors', () => {
    expect(() => parse({ ...valid, assets: { js: [{ src: "a.js", type: 1 }] } })).toThrow(
      `[ADX] ${FILE} - "assets.js" type must be a string`,
    );
    expect(() => parse({ ...valid, assets: { js: [{ src: "a.js", defer: "x" }] } })).toThrow(
      `[ADX] ${FILE} - "assets.js" defer must be a boolean`,
    );
    expect(() => parse({ ...valid, assets: { js: [{ src: "a.js", async: 1 }] } })).toThrow(
      `[ADX] ${FILE} - "assets.js" async must be a boolean`,
    );
  });

  it('"assets.head" must be an array of strings', () => {
    expect(() => parse({ ...valid, assets: { head: "x" } })).toThrow(
      `[ADX] ${FILE} - "assets.head" must be an array of strings`,
    );
    expect(() => parse({ ...valid, assets: { head: [1] } })).toThrow(
      `[ADX] ${FILE} - "assets.head" must be an array of strings`,
    );
  });
});
