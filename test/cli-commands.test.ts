import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs, run } from "../src/cli.js";
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
    // Known real tokens from tokens/design-tokens.json, each with its value.
    expect(printed).toMatch(/space-4\s+16px/);
    expect(printed).toMatch(/primary\s+#1d4ed8/);
    expect(printed).toMatch(/radius-md\s+8px/);
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
      expect(printed).toMatch(/space-x\s+1px/);
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
    for (const name of ["init", "build", "check", "serve", "tokens", "help"]) {
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
});
