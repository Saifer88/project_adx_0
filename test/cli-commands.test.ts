import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, run, usage } from "../src/cli.js";
import type { ParsedArgs } from "../src/cli.js";

/** A fully-populated ParsedArgs with overrides, so each test states only the
 * fields it cares about (mirrors the shape parseArgs produces). */
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

describe("adx tokens", () => {
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

  it("lists the bundled framework tokens (spacing, color, radius) with values", () => {
    const code = run(argsFor({ command: "tokens" }));

    expect(code).toBe(0);
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    // Known real tokens from tokens/design-tokens.json, each rendered as the
    // documented `name = value` row (the ` = ` delimiter is required, not just
    // whitespace alignment).
    expect(printed).toMatch(/space-4\s+= 16px/);
    expect(printed).toMatch(/primary\s+= #1d4ed8/);
    expect(printed).toMatch(/radius-md\s+= 8px/);
    // Grouped by category.
    expect(printed).toContain("spacing:");
    expect(printed).toContain("colors:");
    expect(stderr).not.toHaveBeenCalled();
  });

  describe("with a --tokens override", () => {
    let dir: string;

    beforeEach(() => {
      dir = mkdtempSync(join(tmpdir(), "adx-tokens-"));
    });

    afterEach(() => {
      rmSync(dir, { recursive: true, force: true });
    });

    it("reflects a small override token file and exits 0", () => {
      const file = join(dir, "tokens.json");
      writeFileSync(file, JSON.stringify({ spacing: { "space-x": "1px" } }));

      const code = run(argsFor({ command: "tokens", tokens: file }));

      expect(code).toBe(0);
      const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
      // Override row also uses the documented `name = value` delimiter.
      expect(printed).toMatch(/space-x\s+= 1px/);
    });

    it("reports an [ADX] error and exits 1 on malformed JSON", () => {
      const file = join(dir, "bad.json");
      writeFileSync(file, "{ not json");

      const code = run(argsFor({ command: "tokens", tokens: file }));

      expect(code).toBe(1);
      const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
      expect(errText).toMatch(/^\[ADX\]/m);
    });

    it("reports an [ADX] error and exits 1 when the token file is missing", () => {
      const file = join(dir, "does-not-exist.json");

      const code = run(argsFor({ command: "tokens", tokens: file }));

      expect(code).toBe(1);
      const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
      expect(errText).toMatch(/^\[ADX\]/m);
    });
  });
});

describe("adx help", () => {
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

  it("prints every implemented command to stdout and exits 0", () => {
    const code = run(argsFor({ command: "help" }));

    expect(code).toBe(0);
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    for (const name of ["init", "create", "build", "check", "serve", "tokens", "help"]) {
      expect(printed).toContain(`adx ${name}`);
    }
    expect(stderr).not.toHaveBeenCalled();
  });

  it("keeps bare `adx` (no command) as a stderr usage error, exit 1", () => {
    const code = run(argsFor({ command: undefined }));

    expect(code).toBe(1);
    const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(errText).toContain("Usage:");
    expect(stdout).not.toHaveBeenCalled();
  });

  it("keeps an unknown command as a stderr usage error, exit 1", () => {
    const code = run(argsFor({ command: "frobnicate" }));

    expect(code).toBe(1);
    const errText = stderr.mock.calls.map((c) => String(c[0])).join("");
    expect(errText).toContain("Usage:");
  });
});

describe("parseArgs is unchanged by the new commands", () => {
  // Regression: adding tokens/help must not touch serve-flag scoping. For
  // build/check, --host/--port are NOT consumed, so the path stays positional.
  it("does not consume --host/--port for build/check", () => {
    const built = parseArgs(["build", "--host", "fixtures/user-card"]);
    expect(built.host).toBeUndefined();
    expect(built.dir).toBe("fixtures/user-card");

    const checked = parseArgs(["check", "--port", "comp"]);
    expect(checked.port).toBeUndefined();
    expect(checked.dir).toBe("comp");
  });

  it("still reuses the existing --tokens flag for the tokens command", () => {
    const args = parseArgs(["tokens", "--tokens", "custom/tokens.json"]);
    expect(args.command).toBe("tokens");
    expect(args.tokens).toBe("custom/tokens.json");
  });

  it("gates --tailwind to the init command only", () => {
    const inited = parseArgs(["init", "my-app", "--tailwind"]);
    expect(inited.tailwind).toBe(true);
    expect(inited.dir).toBe("my-app");

    // A bare `init --tailwind` still parses the flag (no positional name).
    expect(parseArgs(["init", "--tailwind"]).tailwind).toBe(true);

    // For every other command it stays an unknown `--` token, left undefined.
    expect(parseArgs(["build", "page.json", "--tailwind"]).tailwind).toBeUndefined();
    expect(parseArgs(["create", "foo", "--tailwind"]).tailwind).toBeUndefined();
  });

  it("stores --site only for build/check", () => {
    expect(parseArgs(["build", "page.json", "--site", "site.json"]).site).toBe(
      "site.json",
    );
    expect(parseArgs(["check", "page.json", "--site", "site.json"]).site).toBe(
      "site.json",
    );
  });

  it("consumes the --site value for serve/tokens/init so it never leaks into dir", () => {
    const served = parseArgs(["serve", "dist", "--site", "site.json"]);
    expect(served.site).toBeUndefined();
    expect(served.dir).toBe("dist");

    const toks = parseArgs(["tokens", "--site", "site.json"]);
    expect(toks.site).toBeUndefined();
    expect(toks.dir).toBeUndefined();

    const inited = parseArgs(["init", "myapp", "--site", "site.json"]);
    expect(inited.site).toBeUndefined();
    expect(inited.dir).toBe("myapp");
  });

  it("does not disturb serve --port/--host gating when --site is present", () => {
    const served = parseArgs([
      "serve",
      "dist",
      "--site",
      "s.json",
      "--port",
      "4000",
      "--host",
      "0.0.0.0",
    ]);
    expect(served.port).toBe(4000);
    expect(served.host).toBe("0.0.0.0");
    expect(served.dir).toBe("dist");
    expect(served.site).toBeUndefined();
  });
});

describe("short usage() is the pre-tokens/help literal (error path unchanged)", () => {
  // Regression: `usage()` is embedded in build/check/init missing-target
  // errors, so it must stay byte-for-byte the legacy four-line listing
  // (build/check/init/serve). The full six-command listing with descriptions
  // belongs to `adx help` only, so tokens/help must NOT leak into usage().
  it("lists exactly the four legacy commands, verbatim", () => {
    expect(usage()).toBe(
      [
        "Usage:",
        "  adx build <componentDir|page.json> [--out dist] [--tokens <path>] [--data <file.json>] [--site <site.json>]",
        "  adx check <componentDir|page.json> [--tokens <path>] [--data <file.json>] [--site <site.json>]",
        "  adx init [name]",
        "  adx serve [dir] [--port 3000] [--host localhost]",
      ].join("\n"),
    );
  });

  it("does not mention the tokens or help subcommands", () => {
    const text = usage();
    expect(text).not.toContain("adx tokens");
    expect(text).not.toContain("adx help");
  });
});
