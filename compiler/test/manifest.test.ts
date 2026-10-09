import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadManifest, parseManifest } from "../src/manifest/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "..", "fixtures", "user-card");

describe("manifest loader", () => {
  it("loads the UserCard fixture manifest", () => {
    const m = loadManifest(fixtureDir);
    expect(m.name).toBe("UserCard");
    expect(m.version).toBe("1.0.0");
    expect(m.props.name).toEqual({ type: "string", required: true });
    expect(m.props.avatar).toEqual({ type: "string", default: "/default.png" });
    expect(m.emits).toEqual(["click", "follow"]);
    expect(m.slots).toEqual(["actions"]);
    expect(m.deps).toEqual([]);
  });

  it("passes optional SEO metadata through", () => {
    const m = parseManifest(
      JSON.stringify({
        name: "X",
        version: "1.0.0",
        seo: { title: "T", description: "D", schema: "Article" },
      }),
    );
    expect(m.seo).toEqual({ title: "T", description: "D", schema: "Article" });
  });

  it("errors (line-less) on missing name", () => {
    expect(() => parseManifest(JSON.stringify({ version: "1.0.0" }))).toThrow(
      '[ADX] manifest.json - Missing required field "name"',
    );
  });

  it("errors (line-less) on missing version", () => {
    expect(() => parseManifest(JSON.stringify({ name: "X" }))).toThrow(
      '[ADX] manifest.json - Missing required field "version"',
    );
  });

  it("errors on invalid JSON", () => {
    expect(() => parseManifest("{ not json")).toThrow(
      "[ADX] manifest.json - Invalid JSON",
    );
  });

  it("errors on invalid prop type", () => {
    expect(() =>
      parseManifest(
        JSON.stringify({ name: "X", version: "1", props: { a: { type: "weird" } } }),
      ),
    ).toThrow('[ADX] manifest.json - Prop "a" has invalid type "weird"');
  });

  it("errors on non-string emits entry", () => {
    expect(() =>
      parseManifest(JSON.stringify({ name: "X", version: "1", emits: [1] })),
    ).toThrow('[ADX] manifest.json - Field "emits" must be an array of strings');
  });
});
