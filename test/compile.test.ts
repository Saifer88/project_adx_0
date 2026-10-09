import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileComponent, checkComponent } from "../src/compile.js";
import { fixtureDir, tokensPath } from "./helpers.js";

const opts = { tokensPath };

describe("compileComponent (end-to-end)", () => {
  it("produces the three artifacts for the UserCard fixture", () => {
    const { html, css, glue, manifest } = compileComponent(fixtureDir, opts);
    expect(manifest.name).toBe("UserCard");

    // HTML: complete static document, resolved content, zero {{.
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<main>");
    expect(html).toContain('class="card"');
    expect(html).not.toContain("{{");

    // CSS: scoped + token-resolved.
    expect(css).toContain('[data-adx-c="');
    expect(css).toContain("padding: 16px;");
    expect(css).not.toContain("tokens.");

    // Glue: hydration-only ESM.
    expect(glue).toContain('import { setup');
    expect(glue).not.toContain("createElement");
  });

  it("checkComponent passes on the valid fixture", () => {
    expect(() => checkComponent(fixtureDir, opts)).not.toThrow();
  });
});

describe("compileComponent (broken copy)", () => {
  let dir: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-broken-"));
    cpSync(fixtureDir, dir, { recursive: true });
    // Inject an unknown spacing token on a known line of the style file.
    const style = readFileSync(join(dir, "style.adx.css"), "utf8").replace(
      "pad: tokens.space-4;",
      "pad: tokens.space-5;",
    );
    writeFileSync(join(dir, "style.adx.css"), style, "utf8");
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("throws the exact [ADX] unknown-token error", () => {
    expect(() => checkComponent(dir, opts)).toThrow(
      /^\[ADX\] style\.adx\.css:\d+ - Unknown token "tokens\.space-5" \(available: 0,1,2,3,4,6,8,12,16\)$/,
    );
  });
});
