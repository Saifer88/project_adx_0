import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  scaffoldComponent,
  templatedFiles,
  validateComponentName,
  parseComponentPath,
  pascalCase,
} from "../src/create.js";
import { compileComponent, checkComponent } from "../src/compile.js";
import { run } from "../src/cli.js";
import type { ParsedArgs } from "../src/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = join(here, "..", "tokens", "design-tokens.json");

/** A fully-populated ParsedArgs with overrides (mirrors parseArgs' shape). */
function argsFor(overrides: Partial<ParsedArgs>): ParsedArgs {
  return {
    command: undefined,
    dir: undefined,
    out: "dist",
    tokens: undefined,
    data: undefined,
    site: undefined,
    port: undefined,
    host: undefined,
    ...overrides,
  };
}

describe("scaffoldComponent", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-create-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("writes exactly the four component files and returns their paths", () => {
    const written = scaffoldComponent("widget-card", dir);

    const expected = [
      "widget-card/manifest.json",
      "widget-card/structure.adx",
      "widget-card/behavior.adx.js",
      "widget-card/style.adx.css",
    ];
    expect(written).toEqual(expected);
    for (const rel of expected) {
      expect(existsSync(join(dir, rel))).toBe(true);
    }
    // Only the component directory was created (nothing else at the root).
    expect(readdirSync(dir)).toEqual(["widget-card"]);
    // Only the four files live under the component directory.
    expect(readdirSync(join(dir, "widget-card")).sort()).toEqual(
      [
        "behavior.adx.js",
        "manifest.json",
        "structure.adx",
        "style.adx.css",
      ].sort(),
    );
  });

  it("refuses to overwrite and writes nothing when re-run", () => {
    scaffoldComponent("widget-card", dir);
    expect(() => scaffoldComponent("widget-card", dir)).toThrow(
      /already exists; refusing to overwrite$/,
    );
  });

  it.each([
    "manifest.json",
    "structure.adx",
    "behavior.adx.js",
    "style.adx.css",
  ])("refuses when %s already exists and writes nothing else", (filename) => {
    // Pre-create one of the four targets; the guard must fail before writing
    // any OTHER file.
    mkdirSync(join(dir, "widget-card"));
    writeFileSync(join(dir, "widget-card", filename), "existing", "utf8");

    expect(() => scaffoldComponent("widget-card", dir)).toThrow(
      /already exists; refusing to overwrite$/,
    );

    // No OTHER scaffold file was written, and the pre-existing one is intact.
    const others = [
      "manifest.json",
      "structure.adx",
      "behavior.adx.js",
      "style.adx.css",
    ].filter((f) => f !== filename);
    for (const f of others) {
      expect(existsSync(join(dir, "widget-card", f))).toBe(false);
    }
    expect(readFileSync(join(dir, "widget-card", filename), "utf8")).toBe(
      "existing",
    );
  });

  it("scaffolds a component that compiles clean with no --data", () => {
    scaffoldComponent("widget-card", dir);

    const result = compileComponent(join(dir, "widget-card"), { tokensPath });

    // Build-time interpolation resolved: zero `{{`, tokens all resolved.
    expect(result.html).not.toContain("{{");
    expect(result.css).not.toContain("tokens.");
    // WCAG-AA baseline: a semantic element, a named control, a token-sized
    // touch target on the control.
    expect(result.html).toContain("<article");
    expect(result.html).toContain("<button");
    expect(result.css).toContain("min-height");
    // The defaulted PascalCase title fills the <h2> (component is composed
    // under a page's <h1>, so it uses <h2>, not <h1>).
    expect(result.html).toContain("<h2");
    expect(result.html).toContain("WidgetCard");
  });

  it("checkComponent does not throw for the generated component with no --data", () => {
    scaffoldComponent("widget-card", dir);
    expect(() =>
      checkComponent(join(dir, "widget-card"), { tokensPath }),
    ).not.toThrow();
  });

  it("scaffolds a nested single-level path and derives the name from the last segment", () => {
    const written = scaffoldComponent("landing/footer", dir);

    const expected = [
      "landing/footer/manifest.json",
      "landing/footer/structure.adx",
      "landing/footer/behavior.adx.js",
      "landing/footer/style.adx.css",
    ];
    expect(written).toEqual(expected);
    for (const rel of expected) {
      expect(existsSync(join(dir, rel))).toBe(true);
    }
    // PascalCase manifest name comes from the LAST segment only.
    expect(
      readFileSync(join(dir, "landing/footer/manifest.json"), "utf8"),
    ).toContain(`"name": "Footer"`);
    // `landing/` is the only thing created at the root.
    expect(readdirSync(dir)).toEqual(["landing"]);
  });

  it("scaffolds an arbitrary-depth path (a/b/c/footer)", () => {
    const written = scaffoldComponent("a/b/c/footer", dir);

    expect(written).toEqual([
      "a/b/c/footer/manifest.json",
      "a/b/c/footer/structure.adx",
      "a/b/c/footer/behavior.adx.js",
      "a/b/c/footer/style.adx.css",
    ]);
    expect(existsSync(join(dir, "a/b/c/footer/manifest.json"))).toBe(true);
    expect(
      readFileSync(join(dir, "a/b/c/footer/manifest.json"), "utf8"),
    ).toContain(`"name": "Footer"`);
  });

  it("derives PascalCase from the last segment only (contact-us/sidebar -> Sidebar)", () => {
    scaffoldComponent("contact-us/sidebar", dir);
    expect(
      readFileSync(join(dir, "contact-us/sidebar/manifest.json"), "utf8"),
    ).toContain(`"name": "Sidebar"`);
  });

  it("scaffolds a nested component that compiles clean with no --data", () => {
    scaffoldComponent("landing/footer", dir);

    const result = compileComponent(join(dir, "landing/footer"), { tokensPath });

    expect(result.html).not.toContain("{{");
    expect(result.css).not.toContain("tokens.");
    expect(result.html).toContain("Footer");
  });

  it("succeeds into an existing prefix dir lacking the four files, then refuses on re-run", () => {
    // Pre-create the prefix dir (empty): creating into it still succeeds.
    mkdirSync(join(dir, "landing"), { recursive: true });
    expect(() => scaffoldComponent("landing/footer", dir)).not.toThrow();
    expect(existsSync(join(dir, "landing/footer/manifest.json"))).toBe(true);

    // Re-running refuses and writes nothing new (the four files now exist).
    expect(() => scaffoldComponent("landing/footer", dir)).toThrow(
      /already exists; refusing to overwrite$/,
    );
  });

  it.each([
    "landing//footer",
    "/footer",
    "landing/",
    "landing/Footer",
    "a/../b",
    "a\\b",
    "landing/foo--bar",
    "/landing",
  ])("rejects %o with an [ADX] error and writes nothing", (bad) => {
    expect(() => scaffoldComponent(bad, dir)).toThrow(/^\[ADX\]/);
    // Nothing was written: the temp dir is untouched.
    expect(readdirSync(dir)).toEqual([]);
  });
});

describe("validateComponentName", () => {
  it("accepts a lowercase, hyphenated slug", () => {
    expect(validateComponentName("widget-card")).toBe("widget-card");
    expect(validateComponentName("a1")).toBe("a1");
  });

  it.each(["WidgetCard", "../x", "a/b", "", "-lead", "trail-", "a--b"])(
    "rejects %o with an [ADX] invalid error",
    (bad) => {
      expect(() => validateComponentName(bad)).toThrow(/^\[ADX\] .* invalid/);
    },
  );
});

describe("parseComponentPath", () => {
  it("parses a bare name into an empty prefix and itself as the component", () => {
    expect(parseComponentPath("button")).toEqual({ dirs: [], name: "button" });
  });

  it("splits a nested path into the dir prefix and the last segment", () => {
    expect(parseComponentPath("landing/footer")).toEqual({
      dirs: ["landing"],
      name: "footer",
    });
    expect(parseComponentPath("a/b/c/footer")).toEqual({
      dirs: ["a", "b", "c"],
      name: "footer",
    });
  });

  it.each([
    "landing//footer",
    "/footer",
    "landing/",
    "landing/Footer",
    "a/../b",
    "a\\b",
    "",
    "landing/foo--bar",
  ])("rejects %o with an [ADX] invalid error", (bad) => {
    expect(() => parseComponentPath(bad)).toThrow(/^\[ADX\] .* invalid/);
  });
});

describe("pascalCase", () => {
  it("derives a PascalCase name from a slug", () => {
    expect(pascalCase("widget-card")).toBe("WidgetCard");
    expect(pascalCase("card")).toBe("Card");
  });
});

describe("templatedFiles", () => {
  it("produces the four files under <name>/ with the PascalCase manifest name", () => {
    const files = templatedFiles("widget-card");
    expect(files.map((f) => f.path)).toEqual([
      "widget-card/manifest.json",
      "widget-card/structure.adx",
      "widget-card/behavior.adx.js",
      "widget-card/style.adx.css",
    ]);
    const manifest = files[0].contents;
    expect(manifest).toContain(`"name": "WidgetCard"`);
  });
});

describe("adx create CLI dispatch", () => {
  let cwd: string;
  let originalCwd: string;
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), "adx-create-cli-"));
    originalCwd = process.cwd();
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.chdir(cwd);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    stdout.mockRestore();
    stderr.mockRestore();
    rmSync(cwd, { recursive: true, force: true });
  });

  it("creates the component and prints the created paths, exit 0", () => {
    const code = run(argsFor({ command: "create", dir: "widget-card" }));

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "widget-card", "manifest.json"))).toBe(true);
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(printed).toContain("widget-card/manifest.json");
    expect(printed).toContain("widget-card/style.adx.css");
  });

  it("returns 1 with the [ADX] clobber error on a conflict", () => {
    run(argsFor({ command: "create", dir: "widget-card" }));
    const code = run(argsFor({ command: "create", dir: "widget-card" }));

    expect(code).toBe(1);
    const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(errText).toMatch(/^\[ADX\] .* already exists/m);
  });

  it("returns 1 with an [ADX] usage error when the name is missing", () => {
    const code = run(argsFor({ command: "create", dir: undefined }));

    expect(code).toBe(1);
    const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(errText).toMatch(/^\[ADX\]/m);
  });

  it("creates a nested component under the current dir, exit 0", () => {
    const code = run(argsFor({ command: "create", dir: "landing/footer" }));

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "landing", "footer", "manifest.json"))).toBe(
      true,
    );
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(printed).toContain("landing/footer/manifest.json");
    expect(printed).toContain("landing/footer/style.adx.css");
  });

  it("returns 1 with an [ADX] error and writes nothing on an invalid nested path", () => {
    const code = run(argsFor({ command: "create", dir: "landing//footer" }));

    expect(code).toBe(1);
    const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(errText).toMatch(/^\[ADX\]/m);
    expect(existsSync(join(cwd, "landing"))).toBe(false);
  });
});
