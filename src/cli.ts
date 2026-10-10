#!/usr/bin/env node
/**
 * ADX compiler CLI (Milestone 1): `adx build` and `adx check` only.
 *
 *   adx build <componentDir> [--out dist] [--tokens tokens/design-tokens.json]
 *       Compiles the component and writes <out>/<dir-basename>/index.html,
 *       style.css, glue.js, behavior.js. The output folder is the component
 *       directory's basename (e.g. `user-card`), not the manifest name.
 *
 *   adx check <componentDir> [--tokens ...]
 *       Validates + emits in-memory, writes nothing. Prints "OK" and exits 0 on
 *       success, or the `[ADX] ...` error and exits 1 on failure.
 *
 * No other subcommands exist in M1.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { compileComponent, checkComponent } from "./compile.js";
import { compilePage, checkPage } from "./page/compile.js";

interface ParsedArgs {
  command: string | undefined;
  dir: string | undefined;
  out: string;
  tokens: string | undefined;
  data: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const parsed: ParsedArgs = {
    command,
    dir: undefined,
    out: "dist",
    tokens: undefined,
    data: undefined,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--out") {
      parsed.out = rest[++i] ?? parsed.out;
    } else if (arg === "--tokens") {
      parsed.tokens = rest[++i];
    } else if (arg === "--data") {
      parsed.data = rest[++i];
    } else if (!arg.startsWith("--") && parsed.dir === undefined) {
      parsed.dir = arg;
    }
  }
  return parsed;
}

/** Read + parse a `--data` JSON file into a props object, or throw a fatal
 * CLI-level `[ADX] <file> - …` error. */
function loadData(path: string): Record<string, unknown> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`[ADX] ${path} - Cannot read data file`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`[ADX] ${path} - Invalid JSON`);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`[ADX] ${path} - Data must be a JSON object of props`);
  }
  return parsed as Record<string, unknown>;
}

function usage(): string {
  return [
    "Usage:",
    "  adx build <componentDir|page.json> [--out dist] [--tokens <path>] [--data <file.json>]",
    "  adx check <componentDir|page.json> [--tokens <path>] [--data <file.json>]",
  ].join("\n");
}

/** Build/check a single component directory (M1 path, unchanged behavior). */
function runComponent(args: ParsedArgs): number {
  const dir = args.dir as string;
  const opts: { tokensPath?: string; data?: Record<string, unknown> } = {};
  if (args.tokens) {
    opts.tokensPath = args.tokens;
  }
  // --data applies ONLY to the component path; a page carries per-instance data.
  if (args.data) {
    opts.data = loadData(args.data);
  }

  if (args.command === "check") {
    checkComponent(dir, opts);
    process.stdout.write("OK\n");
    return 0;
  }

  const result = compileComponent(dir, opts);
  // Output folder = the component directory's basename (e.g. `user-card`),
  // which keeps clean, stable, hyphenated URLs regardless of manifest casing.
  const outDir = join(args.out, basename(dir.replace(/[/\\]+$/, "")));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), result.html, "utf8");
  writeFileSync(join(outDir, "style.css"), result.css, "utf8");
  writeFileSync(join(outDir, "glue.js"), result.glue, "utf8");
  // The glue module hydrates the static HTML by importing the component's
  // behavior exports from `./behavior.js`. Emit that module alongside the glue
  // so the import resolves in the browser — `behavior.adx.js` is already plain
  // ES-module JS (scanned, never executed at build time), so it is copied as-is.
  writeFileSync(
    join(outDir, "behavior.js"),
    readFileSync(join(dir, "behavior.adx.js"), "utf8"),
    "utf8",
  );
  process.stdout.write(`Built ${result.manifest.name} -> ${outDir}\n`);
  return 0;
}

/** Build/check a page manifest. Writes one `index.html` per clean URL. */
function runPage(args: ParsedArgs): number {
  const pageFile = args.dir as string;
  const opts: { tokensPath?: string } = {};
  if (args.tokens) {
    opts.tokensPath = args.tokens;
  }

  if (args.command === "check") {
    checkPage(pageFile, opts);
    process.stdout.write("OK\n");
    return 0;
  }

  const result = compilePage(pageFile, opts);
  // page "index"/"home" -> site root <out>/index.html; else <out>/<slug>/index.html.
  const slug = result.page.page;
  const outDir =
    slug === "index" || slug === "home" ? args.out : join(args.out, slug);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "index.html"), result.html, "utf8");
  writeFileSync(join(outDir, "style.css"), result.css, "utf8");
  writeFileSync(join(outDir, "glue.js"), result.glue, "utf8");
  // Each distinct component's hydration module + its behavior source, beside
  // the page so the relative imports resolve in the browser.
  for (const comp of result.components) {
    writeFileSync(join(outDir, `${comp.stem}.glue.js`), comp.glue, "utf8");
    writeFileSync(
      join(outDir, `${comp.stem}.behavior.js`),
      readFileSync(join(comp.absDir, "behavior.adx.js"), "utf8"),
      "utf8",
    );
  }
  process.stdout.write(`Built page ${slug} -> ${outDir}\n`);
  return 0;
}

function run(argv: string[]): number {
  const args = parseArgs(argv);

  if (args.command !== "build" && args.command !== "check") {
    process.stderr.write(usage() + "\n");
    return 1;
  }
  if (!args.dir) {
    process.stderr.write(`Missing <componentDir|page.json>.\n${usage()}\n`);
    return 1;
  }

  try {
    // Strict 3-step dispatch (no overlap):
    //   1. positional arg ends in .json  -> page build/check
    //   2. else a dir containing manifest.json -> component build/check (M1)
    //   3. else -> fatal "Not a component directory or page manifest"
    const input = args.dir;
    if (input.endsWith(".json")) {
      return runPage(args);
    }
    if (existsSync(resolve(input, "manifest.json"))) {
      return runComponent(args);
    }
    throw new Error(
      `[ADX] ${input} - Not a component directory or page manifest`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(message + "\n");
    return 1;
  }
}

process.exit(run(process.argv.slice(2)));
