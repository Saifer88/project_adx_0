import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTokens, parseTokens } from "../src/tokens/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, "..", "tokens", "design-tokens.json");

describe("token loader", () => {
  it("loads the repo-root design-tokens.json", () => {
    const table = loadTokens(tokensPath);
    expect(table.resolve("tokens.space-4")).toBe("16px");
    expect(table.resolve("primary")).toBe("#1d4ed8");
  });

  it("resolves both tokens.<name> and bare <name>", () => {
    const table = loadTokens(tokensPath);
    expect(table.resolve("tokens.radius-lg")).toBe(table.resolve("radius-lg"));
  });

  it("reports presence via has()", () => {
    const table = loadTokens(tokensPath);
    expect(table.has("tokens.text-xl")).toBe(true);
    expect(table.has("tokens.space-5")).toBe(false);
  });

  it("lists spacing indices", () => {
    const table = loadTokens(tokensPath);
    expect(table.availableSpacing()).toBe("0,1,2,3,4,6,8,12,16");
  });

  it("contains every documented token name", () => {
    const table = loadTokens(tokensPath);
    const expected = [
      "space-0","space-1","space-2","space-3","space-4","space-6","space-8","space-12","space-16",
      "surface-0","surface-1","surface-2","surface-3",
      "text-1","text-2","text-3",
      "primary","secondary","success","warning","error","info","border",
      "radius-sm","radius-md","radius-lg","radius-full",
      "shadow-sm","shadow-md","shadow-lg",
      "text-xs","text-sm","text-base","text-lg","text-xl","text-2xl","text-3xl",
      "weight-normal","weight-medium","weight-bold",
      "font-sans","font-serif","font-mono",
      "breakpoint-sm","breakpoint-md","breakpoint-lg","breakpoint-xl",
    ];
    for (const name of expected) {
      expect(table.has(name), `missing token ${name}`).toBe(true);
    }
  });

  it("design-tokens.json parses as JSON", () => {
    expect(() => JSON.parse(readFileSync(tokensPath, "utf8"))).not.toThrow();
  });

  it("throws on unknown token resolution", () => {
    const table = parseTokens('{"spacing":{"space-0":"0"}}');
    expect(() => table.resolve("space-99")).toThrow('Unknown token "space-99"');
  });
});
