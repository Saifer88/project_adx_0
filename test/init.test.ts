import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { scaffoldProject, SCAFFOLD_FILES } from "../src/scaffold.js";
import { compileComponent } from "../src/compile.js";
import { compilePage } from "../src/page/compile.js";
import { run } from "../src/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoTokensPath = join(here, "..", "tokens", "design-tokens.json");

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

  it("embeds the repo's real design tokens verbatim (no silent drift)", () => {
    // The templates are embedded as string constants, but they must stay
    // identical to the shipped token source — guard against hand-sync drift.
    scaffoldProject(dir);
    const scaffolded = readFileSync(
      join(dir, "tokens", "design-tokens.json"),
      "utf8",
    );
    const repo = readFileSync(repoTokensPath, "utf8");
    expect(scaffolded).toBe(repo);
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
    // The card title is the page's main heading: it must be an <h1>, and the
    // Dismiss control must carry a token-sized min-height for the touch target.
    expect(result.html).toContain("<h1");
    expect(result.css).toContain("min-height");
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
    // Heading hierarchy: exactly one <h1> on the page, and no <h2> (which would
    // skip level one for this single-card starter). Pins the SEO/a11y baseline.
    const h1Count = (result.html.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);
    expect(result.html).not.toMatch(/<h2[\s>]/);
  });
});

describe("adx init CLI dispatch", () => {
  let cwd: string;
  let originalCwd: string;
  let stdout: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "adx-init-cli-"));
    originalCwd = process.cwd();
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    stdout.mockRestore();
    rmSync(cwd, { recursive: true, force: true });
  });

  it("resolves a bare `init` to the current directory and returns 0", () => {
    process.chdir(cwd);
    const code = run({
      command: "init",
      dir: undefined,
      out: "dist",
      tokens: undefined,
      data: undefined,
      port: undefined,
      host: undefined,
    });

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "hello-card", "manifest.json"))).toBe(true);
    expect(existsSync(join(cwd, "index.json"))).toBe(true);
    // Next-step commands are printed to stdout.
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(printed).toContain("Created ADX project");
    expect(printed).toContain("adx build hello-card");
    expect(printed).toContain("adx serve dist");
  });

  it("resolves `init <name>` to ./<name> and prints a `cd` step", () => {
    process.chdir(cwd);
    const code = run({
      command: "init",
      dir: "my-app",
      out: "dist",
      tokens: undefined,
      data: undefined,
      port: undefined,
      host: undefined,
    });

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "my-app", "hello-card", "manifest.json"))).toBe(
      true,
    );
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(printed).toContain("cd my-app");
  });

  it("returns 1 with the [ADX] clobber error when the target already has a scaffold file", () => {
    process.chdir(cwd);
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    writeFileSync(join(cwd, "index.json"), "{}", "utf8");

    const code = run({
      command: "init",
      dir: undefined,
      out: "dist",
      tokens: undefined,
      data: undefined,
      port: undefined,
      host: undefined,
    });

    expect(code).toBe(1);
    const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(errText).toMatch(/^\[ADX\] .* already exists/m);
    // Nothing else was written.
    expect(existsSync(join(cwd, "hello-card", "manifest.json"))).toBe(false);
    stderr.mockRestore();
  });
});
