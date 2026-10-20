import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  existsSync,
  mkdirSync,
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

  it("creates the component, tokens, page, README, and npm project files", () => {
    const written = scaffoldProject(dir);

    const expected = [
      "app-shell/manifest.json",
      "app-shell/structure.adx",
      "app-shell/behavior.adx.js",
      "app-shell/style.adx.css",
      "hello-card/manifest.json",
      "hello-card/structure.adx",
      "hello-card/behavior.adx.js",
      "hello-card/style.adx.css",
      "tokens/design-tokens.json",
      "index.json",
      "README.md",
      "package.json",
      ".gitignore",
      "AGENTS.md",
    ];
    expect(written).toEqual(expected);
    for (const rel of expected) {
      expect(existsSync(join(dir, rel))).toBe(true);
    }
    // SCAFFOLD_FILES is the single source of truth for the written set.
    expect(SCAFFOLD_FILES.map((f) => f.path)).toEqual(expected);
  });

  it("pins the generating CLI as a local dependency with portable npm scripts", () => {
    scaffoldProject(dir);
    const framework = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    const app = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

    expect(app.private).toBe(true);
    expect(app.type).toBe("module");
    expect(app.devDependencies).toEqual({ [framework.name]: framework.version });
    expect(app.engines).toEqual(framework.engines);
    expect(app.scripts).toEqual({
      build: "adx build index.json",
      check: "adx check index.json",
      serve: "adx serve dist",
    });
    expect(readFileSync(join(dir, ".gitignore"), "utf8")).toBe("node_modules/\ndist/\n");
    expect(existsSync(join(dir, "node_modules"))).toBe(false);
    expect(existsSync(join(dir, "package-lock.json"))).toBe(false);
    const readme = readFileSync(join(dir, "README.md"), "utf8");
    for (const command of ["npm install", "npm run check", "npm run build", "npm run serve"]) {
      expect(readme).toContain(command);
    }
    expect(readme).toContain("package-lock.json");
  });

  it("provides portable Caveman defaults, app boundaries, and local CLI setup", () => {
    scaffoldProject(dir);
    const instructions = readFileSync(join(dir, "AGENTS.md"), "utf8");
    expect(instructions).toContain("Caveman ultra");
    expect(instructions).toContain("its ultra mode");
    expect(instructions).toContain("If the caveman skill is available");
    expect(instructions).toContain("Otherwise follow these rules directly");
    expect(instructions).toContain("normal prose");
    expect(instructions).toContain("explicit requests");
    expect(instructions).toContain("compiler and CLI as dependencies");
    expect(instructions).toContain("Do not edit `node_modules/`, the installed ADX package, or generated `dist/`");
    expect(instructions).toContain("explicitly requests framework development");
    expect(instructions).toContain("preserve its version");
    expect(instructions).toContain("npm install");
    expect(instructions).toContain("npm install --save-dev --save-exact project-adx-0");
    expect(instructions).toContain("Do not install the npm package named `adx`");
    expect(instructions).toContain("report the error");
    expect(instructions).toContain("npm run check");
    expect(instructions).toContain("npm run build");
    expect(instructions).toContain("npm run serve");
    expect(instructions).toContain("node_modules/project-adx-0/docs/agent-reference.md");
    expect(readFileSync(join(dir, "README.md"), "utf8")).toContain("[AGENTS.md](./AGENTS.md)");
  });

  it.each(["index.json", "package.json", ".gitignore", "AGENTS.md"])("refuses to overwrite %s and writes nothing", (filename) => {
    // Pre-create one of the scaffold targets; the guard must fail before
    // writing any OTHER file.
    writeFileSync(join(dir, filename), "existing content", "utf8");

    expect(() => scaffoldProject(dir)).toThrow(/^\[ADX\] .* already exists/);

    // No other scaffold file was created (including the new app-shell files).
    expect(existsSync(join(dir, "app-shell", "manifest.json"))).toBe(false);
    expect(existsSync(join(dir, "hello-card", "manifest.json"))).toBe(false);
    expect(existsSync(join(dir, "tokens", "design-tokens.json"))).toBe(false);
    expect(existsSync(join(dir, "README.md"))).toBe(false);
    expect(readFileSync(join(dir, filename), "utf8")).toBe("existing content");
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
    // The card renders inside app-shell's content region (the shell header owns
    // the page <h1>), so the card title is an <h2>; the Dismiss control must
    // carry a token-sized min-height for the touch target.
    expect(result.html).toContain("<h2");
    expect(result.css).toContain("min-height");
  });

  it("scaffolds an app-shell root that composes the card and owns the single <h1>", () => {
    scaffoldProject(dir);

    const result = compileComponent(join(dir, "app-shell"), {
      tokensPath: join(dir, "tokens", "design-tokens.json"),
    });

    // No data: every app-shell prop defaults, so it compiles clean.
    expect(result.html).toContain("My ADX App");
    // The composed child renders inside app-shell's content region.
    expect(result.html).toContain("Welcome to your new ADX project.");
    expect(result.html).not.toContain("{{");
    expect(result.css).not.toContain("tokens.");
    // Semantic layout regions, with the single <h1> in the header.
    expect(result.html).toContain("<header");
    expect(result.html).toContain("<footer");
    const h1Count = (result.html.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);
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
    // Heading hierarchy (SEO/a11y baseline): exactly one <h1> — the app-shell
    // header's app title — plus at least one <h2> (the composed card title),
    // and no <h3> (no skipped level in the starter).
    const h1Count = (result.html.match(/<h1[\s>]/g) ?? []).length;
    expect(h1Count).toBe(1);
    expect(result.html).toMatch(/<h2[\s>]/);
    expect(result.html).not.toMatch(/<h3[\s>]/);
    // Semantic layout regions are present as static markup (crawlable).
    expect(result.html).toContain("<header");
    expect(result.html).toContain("<footer");
    expect(result.html).toContain("My ADX App");
  });

  it("compiles the agent reference's four-file example verbatim", () => {
    const reference = readFileSync(
      join(here, "..", "docs", "agent-reference.md"),
      "utf8",
    );
    const example = reference.split("## Runnable Component Example\n")[1]
      .split("## Design Tokens\n")[0];
    const files = [...example.matchAll(/^### ([\w.-]+)\n```\w+\n([\s\S]*?)\n```/gm)];
    expect(files.map((match) => match[1])).toEqual([
      "manifest.json",
      "structure.adx",
      "behavior.adx.js",
      "style.adx.css",
    ]);
    for (const [, filename, content] of files) {
      writeFileSync(join(dir, filename), `${content}\n`, "utf8");
    }

    const result = compileComponent(dir, { tokensPath: repoTokensPath });

    expect(result.html).toContain("Counter");
    expect(result.html).toContain("Clicks: 0");
    expect(result.html).not.toContain("{{");
    expect(result.css).not.toContain("tokens.");
    expect(result.glue).toContain("onIncrement");
  });

  describe("--tailwind", () => {
    it("default (no flag) writes no Tailwind files or dependencies", () => {
      scaffoldProject(dir);

      expect(existsSync(join(dir, "styles", "tailwind.css"))).toBe(false);
      const app = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      expect(app.devDependencies.tailwindcss).toBeUndefined();
      expect(app.devDependencies["@tailwindcss/cli"]).toBeUndefined();
      expect(app.scripts.tailwind).toBeUndefined();
      expect(app.scripts.build).toBe("adx build index.json");
      // The default page carries no assets block.
      const page = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
      expect(page.assets).toBeUndefined();
    });

    it("writes the Tailwind input source only when the flag is set", () => {
      const written = scaffoldProject(dir, { tailwind: true });

      expect(written).toContain("styles/tailwind.css");
      const input = readFileSync(join(dir, "styles", "tailwind.css"), "utf8");
      expect(input).toContain('@import "tailwindcss"');
    });

    it("pins Tailwind to the framework's own exact versions with a build script", () => {
      scaffoldProject(dir, { tailwind: true });
      const framework = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
      const app = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));

      // Pinned EXACTLY to the CLI's own devDependency versions (read, not hardcoded).
      expect(app.devDependencies.tailwindcss).toBe(framework.devDependencies.tailwindcss);
      expect(app.devDependencies["@tailwindcss/cli"]).toBe(
        framework.devDependencies["@tailwindcss/cli"],
      );
      // The local ADX pin is preserved alongside Tailwind.
      expect(app.devDependencies[framework.name]).toBe(framework.version);
      // A tailwind script compiles the input, and build runs it before adx build.
      expect(app.scripts.tailwind).toBe(
        "@tailwindcss/cli -i styles/tailwind.css -o dist/tailwind.css --minify",
      );
      expect(app.scripts.build).toBe("npm run tailwind && adx build index.json");
      // init never installs.
      expect(existsSync(join(dir, "node_modules"))).toBe(false);
      expect(existsSync(join(dir, "package-lock.json"))).toBe(false);
    });

    it("references the compiled tailwind.css from the page and still compiles with no data", () => {
      scaffoldProject(dir, { tailwind: true });
      const page = JSON.parse(readFileSync(join(dir, "index.json"), "utf8"));
      expect(page.assets.css).toContain("/tailwind.css");

      // The page compiles with no --data (every prop defaults); assets are
      // referenced, not required to exist on disk.
      const result = compilePage(join(dir, "index.json"), {
        tokensPath: join(dir, "tokens", "design-tokens.json"),
      });
      expect(result.html).toContain("Welcome to your new ADX project.");
      expect(result.html).not.toContain("{{");
      expect(result.html).toContain("/tailwind.css");
    });

    it.each(["styles/tailwind.css", "index.json"])(
      "refuses to overwrite %s in a --tailwind run and writes nothing",
      (filename) => {
        const abs = join(dir, filename);
        // Pre-create the conflicting target (its parent dir may need creating).
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, "existing content", "utf8");

        expect(() => scaffoldProject(dir, { tailwind: true })).toThrow(
          /^\[ADX\] .* already exists/,
        );

        // No OTHER scaffold file was created.
        expect(existsSync(join(dir, "app-shell", "manifest.json"))).toBe(false);
        expect(readFileSync(abs, "utf8")).toBe("existing content");
      },
    );
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
    expect(printed).toContain("npm install");
    expect(printed).toContain("npm run check");
    expect(printed).toContain("npm run build");
    expect(printed).toContain("npm run serve");
    expect(printed).not.toContain("  cd ");
    const app = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    const framework = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8"));
    expect(app.devDependencies[framework.name]).toBe(framework.version);
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

  it("wires Tailwind with `init --tailwind` and prints the tailwind step", () => {
    process.chdir(cwd);
    const code = run({
      command: "init",
      dir: "tw-app",
      out: "dist",
      tokens: undefined,
      data: undefined,
      port: undefined,
      host: undefined,
      tailwind: true,
    });

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "tw-app", "styles", "tailwind.css"))).toBe(true);
    const app = JSON.parse(readFileSync(join(cwd, "tw-app", "package.json"), "utf8"));
    expect(app.devDependencies.tailwindcss).toBeDefined();
    expect(app.scripts.tailwind).toBeDefined();
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(printed).toContain("npm run tailwind");
    // init never installs.
    expect(existsSync(join(cwd, "tw-app", "node_modules"))).toBe(false);
  });

  it("omits Tailwind entirely for a default `init` (no flag)", () => {
    process.chdir(cwd);
    const code = run({
      command: "init",
      dir: "plain-app",
      out: "dist",
      tokens: undefined,
      data: undefined,
      port: undefined,
      host: undefined,
    });

    expect(code).toBe(0);
    expect(existsSync(join(cwd, "plain-app", "styles", "tailwind.css"))).toBe(false);
    const app = JSON.parse(readFileSync(join(cwd, "plain-app", "package.json"), "utf8"));
    expect(app.devDependencies.tailwindcss).toBeUndefined();
    const printed = stdout.mock.calls.map((c) => String(c[0])).join("");
    expect(printed).not.toContain("npm run tailwind");
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
