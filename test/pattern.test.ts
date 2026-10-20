import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PATTERNS, scaffoldPattern } from "../src/patterns.js";
import { compileComponent, checkComponent } from "../src/compile.js";
import { parseArgs, run } from "../src/cli.js";
import type { ParsedArgs } from "../src/cli.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoTokensPath = join(here, "..", "tokens", "design-tokens.json");

/** A fully-populated ParsedArgs with overrides (mirrors cli-commands.test.ts). */
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

describe("pattern catalog compiles (data-driven, no --data)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-pattern-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  // AC1/AC3/AC5: every catalog entry scaffolds four files that build + check
  // clean with no --data; HTML is free of `{{`; CSS has no `tokens.` residue.
  // Adding a pattern is only a PATTERNS data entry — this loop proves it.
  for (const name of Object.keys(PATTERNS)) {
    it(`scaffolds and compiles the "${name}" pattern with no --data`, () => {
      const written = scaffoldPattern(PATTERNS[name], join(dir, name));
      expect(written).toEqual([
        "manifest.json",
        "structure.adx",
        "behavior.adx.js",
        "style.adx.css",
      ]);
      const compDir = join(dir, name);

      // AC1: check never throws with no --data.
      expect(() =>
        checkComponent(compDir, { tokensPath: repoTokensPath }),
      ).not.toThrow();

      const result = compileComponent(compDir, { tokensPath: repoTokensPath });
      // SEO static-first: no unresolved interpolation left in the HTML.
      expect(result.html).not.toContain("{{");
      // AC3: all token references resolved — no `tokens.` residue in the CSS.
      expect(result.css).not.toContain("tokens.");
    });
  }

  // Interactive patterns carry a token-sized touch target on their control
  // (space-12 = 48px, at/above the 44px baseline). The static table has no
  // interactive control, so the touch-target rule applies only here.
  for (const name of ["form", "modal"]) {
    it(`${name}'s control carries a token-sized touch target (min-height)`, () => {
      scaffoldPattern(PATTERNS[name], join(dir, name));
      const result = compileComponent(join(dir, name), {
        tokensPath: repoTokensPath,
      });
      expect(result.css).toContain("min-height");
    });
  }

  // AC2: each pattern's required a11y semantics are present in the HTML.
  it("form renders label/for, aria-describedby, submit button, and a live error region", () => {
    scaffoldPattern(PATTERNS.form, join(dir, "form"));
    const result = compileComponent(join(dir, "form"), {
      tokensPath: repoTokensPath,
    });
    expect(result.html).toContain("<label");
    expect(result.html).toContain('for="form-name"');
    expect(result.html).toContain('id="form-name"');
    expect(result.html).toContain("aria-describedby=");
    expect(result.html).toContain('aria-live="polite"');
    expect(result.html).toMatch(/<button[^>]*type="submit"/);
  });

  it("modal renders dialog role, aria-modal, aria-labelledby, and a close button", () => {
    scaffoldPattern(PATTERNS.modal, join(dir, "modal"));
    const result = compileComponent(join(dir, "modal"), {
      tokensPath: repoTokensPath,
    });
    expect(result.html).toContain('role="dialog"');
    expect(result.html).toContain('aria-modal="true"');
    expect(result.html).toContain("aria-labelledby=");
    expect(result.html).toMatch(/<button[^>]*type="button"/);
  });

  it("table renders a caption and scoped column headers", () => {
    scaffoldPattern(PATTERNS.table, join(dir, "table"));
    const result = compileComponent(join(dir, "table"), {
      tokensPath: repoTokensPath,
    });
    expect(result.html).toContain("<caption");
    expect(result.html).toContain('<th scope="col"');
    // Rows are :for-unrolled from the defaulted array prop at build time.
    expect(result.html).toContain("Ada Lovelace");
  });

  // The form's error text is a single bare computed `{{nameError}}`; its
  // `@submit="onSubmit"` keeps FEAT-001's hasWiredEvent gate true, so the
  // computedText update is retained and getNameError is imported into the glue.
  it("form retains a computedText(get: getNameError) update (not frozen)", () => {
    scaffoldPattern(PATTERNS.form, join(dir, "form"));
    const result = compileComponent(join(dir, "form"), {
      tokensPath: repoTokensPath,
    });
    expect(result.glue).toContain('"kind": "computedText"');
    expect(result.glue).toContain('"get": "getNameError"');
    expect(result.glue).toContain("getNameError");
    expect(result.glue).toContain("const GETTERS = {");
  });
});

describe("adx pattern CLI", () => {
  let stdout: ReturnType<typeof vi.spyOn>;
  let stderr: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
  });

  // AC4: bare `pattern` and `--list` both list form/table/modal and exit 0.
  it("lists form/table/modal with no name and exits 0", () => {
    const code = run(argsFor({ command: "pattern" }));
    expect(code).toBe(0);
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    for (const name of ["form", "table", "modal"]) {
      expect(printed).toContain(name);
    }
    expect(stderr).not.toHaveBeenCalled();
  });

  it("lists the catalog for --list even when a name is given (listing wins)", () => {
    const code = run(argsFor({ command: "pattern", dir: "form", list: true }));
    expect(code).toBe(0);
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    for (const name of ["form", "table", "modal"]) {
      expect(printed).toContain(name);
    }
  });

  it("errors on an unknown pattern name and exits 1", () => {
    const code = run(argsFor({ command: "pattern", dir: "nope" }));
    expect(code).toBe(1);
    const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(errText).toContain("[ADX] nope - unknown pattern");
    // Available names are listed, sorted.
    expect(errText).toContain("available: form, modal, table");
  });

  describe("scaffolding into a temp dir", () => {
    let dir: string;
    let originalCwd: string;

    beforeEach(() => {
      // realpath so the assertions (which join against `dir`) match the CWD the
      // scaffolder resolves against; on macOS the temp dir is a /var symlink.
      dir = realpathSync(mkdtempSync(join(tmpdir(), "adx-pattern-cli-")));
      originalCwd = process.cwd();
      process.chdir(dir);
    });

    afterEach(() => {
      process.chdir(originalCwd);
      rmSync(dir, { recursive: true, force: true });
    });

    it("scaffolds a named pattern flat into targetDir and exits 0", () => {
      // The component lands exactly in the chosen targetDir (here `ui/contact/`),
      // flat — four files, no extra `<name>/` nesting (matches `adx create`).
      const code = run(argsFor({ command: "pattern", dir: "form", dir2: "ui/contact" }));
      expect(code).toBe(0);
      expect(existsSync(join(dir, "ui", "contact", "manifest.json"))).toBe(true);
      const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
      expect(printed).toContain("manifest.json");
    });

    it("defaults the targetDir to the pattern name", () => {
      const code = run(argsFor({ command: "pattern", dir: "modal" }));
      expect(code).toBe(0);
      expect(existsSync(join(dir, "modal", "manifest.json"))).toBe(true);
    });

    it("refuses to overwrite a conflicting file and exits 1 (writes nothing)", () => {
      // Scaffold once into mdir, then a second time into the same dir: the
      // conflict-safe writer must refuse the second run and exit 1.
      const first = run(argsFor({ command: "pattern", dir: "modal", dir2: "mdir" }));
      expect(first).toBe(0);
      const second = run(argsFor({ command: "pattern", dir: "modal", dir2: "mdir" }));
      expect(second).toBe(1);
      const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
      expect(errText).toMatch(/\[ADX\] .* already exists/);
    });
  });
});

describe("parseArgs --list / dir2 (pattern-only gating)", () => {
  it("parses `pattern form ui/x --list` into dir, dir2, and list", () => {
    const args = parseArgs(["pattern", "form", "ui/x", "--list"]);
    expect(args.command).toBe("pattern");
    expect(args.dir).toBe("form");
    expect(args.dir2).toBe("ui/x");
    expect(args.list).toBe(true);
  });

  it("leaves --list falsy for non-pattern commands (build)", () => {
    const args = parseArgs(["build", "x", "--list"]);
    expect(args.list).toBeFalsy();
    expect(args.dir).toBe("x");
  });
});
