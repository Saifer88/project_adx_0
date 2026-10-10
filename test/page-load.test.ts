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
