import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffoldProject, SCAFFOLD_FILES } from "../src/scaffold.js";
import { compileComponent } from "../src/compile.js";
import { compilePage } from "../src/page/compile.js";

describe("scaffoldProject", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-init-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("creates the four component files, tokens, page manifest, and README", () => {
    const written = scaffoldProject(dir);

    const expected = [
      "hello-card/manifest.json",
      "hello-card/structure.adx",
      "hello-card/behavior.adx.js",
      "hello-card/style.adx.css",
      "tokens/design-tokens.json",
      "index.json",
      "README.md",
    ];
    expect(written).toEqual(expected);
    for (const rel of expected) {
      expect(existsSync(join(dir, rel))).toBe(true);
    }
    // SCAFFOLD_FILES is the single source of truth for the written set.
    expect(SCAFFOLD_FILES.map((f) => f.path)).toEqual(expected);
  });

  it("refuses to overwrite and writes nothing when a target file already exists", () => {
    // Pre-create one of the scaffold targets; the guard must fail before
    // writing any OTHER file.
    writeFileSync(join(dir, "index.json"), "{}", "utf8");

    expect(() => scaffoldProject(dir)).toThrow(/^\[ADX\] .* already exists/);

    // No other scaffold file was created.
    expect(existsSync(join(dir, "hello-card", "manifest.json"))).toBe(false);
    expect(existsSync(join(dir, "tokens", "design-tokens.json"))).toBe(false);
    expect(existsSync(join(dir, "README.md"))).toBe(false);
  });

  it("scaffolds a component that compiles with the real compiler and greeting", () => {
    scaffoldProject(dir);

    const result = compileComponent(join(dir, "hello-card"), {
      tokensPath: join(dir, "tokens", "design-tokens.json"),
    });

    // The defaulted props resolve into the static HTML — no required-prop
    // failure, and the embedded tokens resolve (no leftover `tokens.`).
    expect(result.html).toContain("Hello, ADX");
    expect(result.html).toContain("Welcome to your new ADX project.");
    expect(result.html).not.toContain("{{");
    expect(result.css).not.toContain("tokens.");
  });

  it("scaffolds a page that compiles to the real greeting at the site root", () => {
    scaffoldProject(dir);

    const result = compilePage(join(dir, "index.json"), {
      tokensPath: join(dir, "tokens", "design-tokens.json"),
    });

    expect(result.page.page).toBe("index");
    expect(result.html).toContain("Welcome to your new ADX project.");
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).not.toContain("{{");
  });
});
