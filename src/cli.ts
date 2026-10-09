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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { compileComponent, checkComponent } from "./compile.js";

interface ParsedArgs {
  command: string | undefined;
  dir: string | undefined;
  out: string;
  tokens: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const parsed: ParsedArgs = {
    command,
    dir: undefined,
    out: "dist",
    tokens: undefined,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--out") {
      parsed.out = rest[++i] ?? parsed.out;
    } else if (arg === "--tokens") {
      parsed.tokens = rest[++i];
    } else if (!arg.startsWith("--") && parsed.dir === undefined) {
      parsed.dir = arg;
    }
  }
  return parsed;
}

function usage(): string {
  return [
    "Usage:",
    "  adx build <componentDir> [--out dist] [--tokens <path>]",
    "  adx check <componentDir> [--tokens <path>]",
  ].join("\n");
}

function run(argv: string[]): number {
  const args = parseArgs(argv);

  if (args.command !== "build" && args.command !== "check") {
    process.stderr.write(usage() + "\n");
    return 1;
  }
  if (!args.dir) {
    process.stderr.write(`Missing <componentDir>.\n${usage()}\n`);
    return 1;
  }

  const opts = args.tokens ? { tokensPath: args.tokens } : {};

  try {
    if (args.command === "check") {
      checkComponent(args.dir, opts);
      process.stdout.write("OK\n");
      return 0;
    }

    const result = compileComponent(args.dir, opts);
    // Output folder = the component directory's basename (e.g. `user-card`),
    // which keeps clean, stable, hyphenated URLs regardless of manifest casing.
    const outDir = join(args.out, basename(args.dir.replace(/[/\\]+$/, "")));
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
      readFileSync(join(args.dir, "behavior.adx.js"), "utf8"),
      "utf8",
    );
    process.stdout.write(`Built ${result.manifest.name} -> ${outDir}\n`);
    return 0;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(message + "\n");
    return 1;
  }
}

process.exit(run(process.argv.slice(2)));
