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
 *   adx serve [dir] [--port 3000] [--host localhost]
 *       Static file server for already-compiled output; it does NOT compile.
 *       `dir` defaults to `dist`. Serves HTML/CSS/JS ES modules over HTTP so you
 *       can preview a build locally. Long-running: it keeps listening until the
 *       process is interrupted (no `process.exit`).
 */

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, extname, join, resolve, sep } from "node:path";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { compileComponent, checkComponent } from "./compile.js";
import { compilePage, checkPage } from "./page/compile.js";
import type { ComponentAsset } from "./codegen/glue.js";

interface ParsedArgs {
  command: string | undefined;
  dir: string | undefined;
  out: string;
  tokens: string | undefined;
  data: string | undefined;
  // serve-only options; undefined when omitted so defaults (3000/localhost)
  // can apply and an explicitly bad --port can be rejected (see serve()).
  port: number | undefined;
  host: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const parsed: ParsedArgs = {
    command,
    dir: undefined,
    out: "dist",
    tokens: undefined,
    data: undefined,
    port: undefined,
    host: undefined,
  };
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--out") {
      parsed.out = rest[++i] ?? parsed.out;
    } else if (arg === "--tokens") {
      parsed.tokens = rest[++i];
    } else if (arg === "--data") {
      parsed.data = rest[++i];
    } else if (arg === "--port") {
      // Only accept a finite positive integer; leave undefined otherwise so
      // serve() can report `[ADX] --port <v> - invalid port` and exit 1.
      const value = Number(rest[++i]);
      if (Number.isInteger(value) && value > 0) {
        parsed.port = value;
      }
    } else if (arg === "--host") {
      parsed.host = rest[++i];
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
    "  adx serve [dir] [--port 3000] [--host localhost]",
  ].join("\n");
}

// Content types for the static files the compiler emits. `.js` is served as
// text/javascript because the glue is a browser ES module. Anything unmapped
// falls back to application/octet-stream.
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/**
 * Static file server for already-compiled output (`adx serve [dir]`). It never
 * compiles — it just streams the files under `dir` (default `dist`) over HTTP.
 * Long-running: the listening server keeps the event loop alive, so this
 * returns without `process.exit`.
 */
function serve(args: ParsedArgs): void {
  const root = resolve(args.dir ?? "dist");
  const port = args.port ?? 3000;
  const host = args.host ?? "localhost";

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    // Only GET/HEAD make sense for a static server.
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method Not Allowed\n");
      return;
    }

    // Decode the request path; malformed percent-encoding is a 400.
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request\n");
      return;
    }

    // SECURITY: resolve against the root and reject anything that escapes it.
    // `..` segments cannot climb above `root` because the resolved path must be
    // `root` itself or sit under `root + sep`.
    const target = resolve(root, "." + pathname);
    if (target !== root && !target.startsWith(root + sep)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden\n");
      return;
    }

    // Directory requests (trailing slash or an actual directory) serve
    // index.html; a missing file is a 404.
    let filePath = target;
    try {
      const stat = statSync(target);
      if (stat.isDirectory()) {
        filePath = join(target, "index.html");
      }
    } catch {
      if (pathname.endsWith("/")) {
        filePath = join(target, "index.html");
      }
    }

    let fileStat;
    try {
      fileStat = statSync(filePath);
      if (fileStat.isDirectory()) {
        throw new Error("is a directory");
      }
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found\n");
      return;
    }

    const type = CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(filePath);
    stream.on("error", () => {
      // The file vanished between stat and read; report it and close.
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      }
      res.end();
    });
    stream.pipe(res);
  });

  server.listen(port, host, () => {
    process.stdout.write(`ADX serving ${root} at http://localhost:${port}/\n`);
  });
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
  // ES-module JS (parsed and executed at build time), so it is copied as-is.
  writeFileSync(
    join(outDir, "behavior.js"),
    readFileSync(join(dir, "behavior.adx.js"), "utf8"),
    "utf8",
  );
  writeComponentAssets(outDir, result.components);
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
  writeComponentAssets(outDir, result.components);
  process.stdout.write(`Built page ${slug} -> ${outDir}\n`);
  return 0;
}

function writeComponentAssets(outDir: string, components: ComponentAsset[]): void {
  for (const comp of components) {
    writeFileSync(join(outDir, `${comp.stem}.glue.js`), comp.glue, "utf8");
    writeFileSync(
      join(outDir, `${comp.stem}.behavior.js`),
      readFileSync(join(comp.absDir, "behavior.adx.js"), "utf8"),
      "utf8",
    );
  }
}

function run(args: ParsedArgs): number {
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

/**
 * Entry point. Parses argv once, then dispatches: `serve` starts a long-running
 * server and returns without exiting (the listener keeps the event loop alive);
 * every other command runs through `run()` and exits with its code, preserving
 * build/check behavior exactly.
 */
function main(argv: string[]): void {
  const args = parseArgs(argv);
  if (args.command === "serve") {
    // A `--port` that was supplied but invalid is left undefined by parseArgs;
    // distinguish "bad value" from "omitted" so we only error on a bad value.
    const portIndex = argv.indexOf("--port");
    if (portIndex !== -1 && args.port === undefined) {
      process.stderr.write(`[ADX] --port ${argv[portIndex + 1] ?? ""} - invalid port\n`);
      process.exit(1);
    }
    serve(args);
    return;
  }
  process.exit(run(args));
}

main(process.argv.slice(2));
