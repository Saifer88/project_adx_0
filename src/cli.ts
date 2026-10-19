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
 *   adx init [name]
 *       Scaffolds a new, minimal ADX starter project (one `hello-card`
 *       component, an `index.json` page, the design tokens, and a README) into
 *       `./<name>` — or the current directory when `name` is omitted or `.`.
 *       One-shot: it refuses to overwrite an existing scaffold file (writing
 *       nothing on conflict), prints what it created plus the next steps, and
 *       exits 0 on success / 1 on error, like `build`/`check`.
 *
 *   adx serve [dir] [--port 3000] [--host localhost]
 *       Static file server for already-compiled output; it does NOT compile.
 *       `dir` defaults to `dist`. Serves HTML/CSS/JS ES modules over HTTP so you
 *       can preview a build locally. Long-running: it keeps listening until the
 *       process is interrupted (no `process.exit`). This is a loopback preview,
 *       not a hardened server — it binds `localhost` by default; passing a
 *       non-loopback `--host` (e.g. `0.0.0.0`) exposes the output on the network
 *       with no access control, and it does not guard against symlinks placed
 *       inside the served directory that point outside it.
 *
 *   adx tokens [--tokens <path>]
 *       Lists every design token (name = value), grouped by category, to stdout.
 *       The default source is the package's bundled tokens/design-tokens.json,
 *       resolved relative to the installed module (not CWD) so a global install
 *       still finds it; `--tokens <path>` overrides it, resolved against CWD like
 *       build/check. One-shot: exits 0 on success, or prints the `[ADX] …` error
 *       to stderr and exits 1 on a load/parse failure.
 *
 *   adx help
 *       Prints the full command listing (every subcommand with its flags and a
 *       one-line description) to stdout and exits 0 — an explicit request, not an
 *       error. (Bare `adx` with no command keeps the short usage on stderr, exit
 *       1; see run().)
 */

import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { compileComponent, checkComponent } from "./compile.js";
import { compilePage, checkPage } from "./page/compile.js";
import { scaffoldProject } from "./scaffold.js";
import { loadTokens } from "./tokens/load.js";
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
  // `--port`/`--host` are serve-only flags. Only consume them (and their value
  // token) when the command is `serve`; for build/check they stay unknown flags
  // and are skipped, so those commands' arg handling is byte-for-byte as before.
  const isServe = command === "serve";
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--out") {
      parsed.out = rest[++i] ?? parsed.out;
    } else if (arg === "--tokens") {
      parsed.tokens = rest[++i];
    } else if (arg === "--data") {
      parsed.data = rest[++i];
    } else if (isServe && arg === "--port") {
      // Only accept a finite integer in the valid TCP range; leave undefined
      // otherwise so main() can report `[ADX] --port <v> - invalid port`.
      const value = Number(rest[++i]);
      if (Number.isInteger(value) && value >= 1 && value <= 65535) {
        parsed.port = value;
      }
    } else if (isServe && arg === "--host") {
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

// Single source for the full `adx help` listing (every implemented command with
// its flags and a one-line description). The short error-path `usage()` is kept
// as a separate verbatim literal so build/check/init error stderr stays
// byte-for-byte unchanged; only `helpText()` consumes this table. Each entry is
// the invocation line plus a one-line description.
const COMMANDS: ReadonlyArray<{ invocation: string; description: string }> = [
  {
    invocation: "adx init [name]",
    description: "Scaffold a new starter project into ./<name> (or CWD).",
  },
  {
    invocation:
      "adx build <componentDir|page.json> [--out dist] [--tokens <path>] [--data <file.json>]",
    description: "Compile a component or page to static HTML/CSS/JS.",
  },
  {
    invocation:
      "adx check <componentDir|page.json> [--tokens <path>] [--data <file.json>]",
    description: "Validate + emit in-memory; writes nothing (prints OK).",
  },
  {
    invocation: "adx serve [dir] [--port 3000] [--host localhost]",
    description: "Preview already-compiled output over HTTP (dir defaults to dist).",
  },
  {
    invocation: "adx tokens [--tokens <path>]",
    description: "List all design tokens, grouped by category.",
  },
  {
    invocation: "adx help",
    description: "Show this full command listing.",
  },
];

/**
 * Short usage shown on errors (bare/unknown command, missing arg) to stderr.
 *
 * This is intentionally the pre-tokens/help literal, preserved verbatim so that
 * build/check/init missing-target errors emit byte-for-byte identical stderr as
 * before these subcommands were added. The full six-command listing (with
 * descriptions) lives only in `helpText()`, reached via the explicit `adx help`
 * command — `tokens`/`help` are discoverable there, not injected into every
 * command's error path.
 */
function usage(): string {
  return [
    "Usage:",
    "  adx build <componentDir|page.json> [--out dist] [--tokens <path>] [--data <file.json>]",
    "  adx check <componentDir|page.json> [--tokens <path>] [--data <file.json>]",
    "  adx init [name]",
    "  adx serve [dir] [--port 3000] [--host localhost]",
  ].join("\n");
}

/** Full help printed by `adx help`: every command with its one-line
 * description. Built from the same `COMMANDS` source as `usage()`. */
function helpText(): string {
  const lines = ["ADX CLI — commands:", ""];
  for (const c of COMMANDS) {
    lines.push(`  ${c.invocation}`);
    lines.push(`      ${c.description}`);
  }
  return lines.join("\n");
}

/**
 * List every design token (`name = value`), grouped by category, to stdout
 * (`adx tokens [--tokens <path>]`). One-shot: returns 0 on success, or prints
 * the standard `[ADX] <path> - …` error to stderr and returns 1 on a load/parse
 * failure — just like build/check.
 *
 * The default source is the package's bundled tokens/design-tokens.json,
 * resolved from this compiled module's location (`import.meta.url` → dist/cli.js
 * → up to the package root) so a GLOBAL install still finds it rather than
 * looking in the user's CWD. A `--tokens <path>` override is resolved against
 * CWD, exactly as build/check resolve their token paths. The grouped listing is
 * rendered from the loader's `groups()` (one read/parse, loader-owned values).
 */
function runTokens(args: ParsedArgs): number {
  const path = args.tokens
    ? resolve(args.tokens)
    : resolve(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "tokens",
        "design-tokens.json",
      );

  try {
    // Read + validate through the shared loader exactly once: a missing or
    // malformed file throws here and takes the same `[ADX] …` error path as the
    // other commands. The loader also preserves category grouping (TokenTable
    // .groups()), so the listing is rendered entirely from loader-owned data —
    // no second read/parse of the source file.
    const table = loadTokens(path);

    const out: string[] = [];
    for (const { group, entries } of table.groups()) {
      out.push(`${group}:`);
      // Align the ` = ` delimiter on a single column within each group for a
      // scannable `name = value` list.
      const width = entries.reduce(
        (max, [name]) => Math.max(max, name.length),
        0,
      );
      for (const [name, value] of entries) {
        out.push(`  ${name.padEnd(width)} = ${value}`);
      }
      out.push("");
    }
    process.stdout.write(out.join("\n") + "\n");
    return 0;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    // Normalize bare loader/JSON errors into the standard `[ADX] <path> - …`
    // shape used across the CLI.
    const text = message.startsWith("[ADX]")
      ? message
      : `[ADX] ${path} - ${message}`;
    process.stderr.write(text + "\n");
    return 1;
  }
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
 * returns without `process.exit`. Returns the `Server` so callers/tests can
 * close it; the CLI entry point ignores the return value.
 */
function serve(args: ParsedArgs): Server {
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
    const rawPath = (req.url ?? "/").split(/[?#]/, 1)[0];
    let decodedRaw: string;
    let pathname: string;
    try {
      decodedRaw = decodeURIComponent(rawPath);
      pathname = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Bad Request\n");
      return;
    }

    // SECURITY: reject a literal `..` segment in the decoded raw path up front so
    // the 403 contract holds even for vectors the WHATWG URL parser would
    // otherwise normalize to an in-root path (e.g. `/../../etc/passwd`).
    if (/(^|\/)\.\.(\/|$)/.test(decodedRaw)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Forbidden\n");
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

  // Translate listen failures (EADDRINUSE, EACCES, bad --host, …) into a
  // concise `[ADX] …` message + exit 1 instead of an uncaught stack trace.
  server.on("error", (err: NodeJS.ErrnoException) => {
    process.stderr.write(`[ADX] serve - ${err.code ?? err.message}\n`);
    process.exit(1);
  });

  server.listen(port, host, () => {
    // Announce a reachable address: substitute localhost for wildcard binds and
    // bracket IPv6 literals so the printed URL is clickable/correct.
    const shown =
      host === "0.0.0.0" || host === "::" ? "localhost" : displayHost(host);
    process.stdout.write(`ADX serving ${root} at http://${shown}:${port}/\n`);
  });

  return server;
}

/** Format a host for a URL: wrap IPv6 literals (containing `:`) in brackets. */
function displayHost(host: string): string {
  return host.includes(":") ? `[${host}]` : host;
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

/**
 * Scaffold a new starter project (`adx init [name]`). One-shot: resolves the
 * target (`name` → `./<name>`; omitted or `.` → CWD), writes the starter files
 * via `scaffoldProject` (which refuses to overwrite, throwing an `[ADX]` error
 * that `run()` turns into stderr + exit 1), then prints what was created plus
 * the exact next-step commands and returns 0.
 */
function runInit(args: ParsedArgs): number {
  const target = args.dir ?? ".";
  const base = resolve(target);
  const created = scaffoldProject(target);

  const out: string[] = [];
  out.push(`Created ADX project in ${base}`);
  for (const path of created) {
    out.push(`  ${path}`);
  }
  out.push("");
  out.push("Next steps:");
  if (target !== ".") {
    out.push(`  cd ${target}`);
  }
  out.push(`  adx build hello-card    # compile the component -> dist/hello-card/`);
  out.push(`  adx build index.json    # compile the page -> dist/index.html`);
  out.push(`  adx serve dist          # preview locally at http://localhost:3000/`);
  process.stdout.write(out.join("\n") + "\n");
  return 0;
}

function run(args: ParsedArgs): number {
  // `help` is an explicit request: full help to STDOUT, exit 0 (not an error).
  if (args.command === "help") {
    process.stdout.write(helpText() + "\n");
    return 0;
  }

  // `tokens` lists the design tokens; one-shot like build/check/init.
  if (args.command === "tokens") {
    return runTokens(args);
  }

  if (
    args.command !== "build" &&
    args.command !== "check" &&
    args.command !== "init"
  ) {
    // Bare `adx` and any unknown command: short usage to STDERR, exit 1
    // (RECOMMENDED — a missing/unknown command is an error, so stderr + nonzero;
    // `adx help` is the discoverable, exit-0 path for intentional help).
    process.stderr.write(usage() + "\n");
    return 1;
  }

  // `init` takes an OPTIONAL positional (name); it never requires `dir`.
  if (args.command === "init") {
    try {
      return runInit(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(message + "\n");
      return 1;
    }
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

// Run the CLI only when invoked as the entry point (`node dist/cli.js …` or the
// installed `adx` bin), so tests can import `parseArgs`/`serve` without starting
// the process. npm installs the bin as a symlink, so compare *real* paths:
// `fileURLToPath(import.meta.url)` is already realpathed by Node's loader, while
// `process.argv[1]` keeps the invoked (symlink) path, so canonicalize it too.
// A lexical `resolve` would never match the symlinked bin and silently no-op.
function isEntryPoint(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  try {
    return realpathSync(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main(process.argv.slice(2));
}

export { parseArgs, serve, run, usage };
export type { ParsedArgs };
