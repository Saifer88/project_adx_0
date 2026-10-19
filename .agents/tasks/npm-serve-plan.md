# Implementation Plan — npm publishing + `adx serve`

Scope: add a static `serve` subcommand to the CLI, rename the npm package to
`project-adx-0` (CLI binary stays `adx`), add a publish-on-main GitHub Action
guarded against republishing an existing version, and sync README + docs. Every
item must leave `build`/`check` behavior byte-for-byte identical.

Discovered facts that ground this plan (verify these yourself before editing):
- `src/cli.ts` ends with `process.exit(run(process.argv.slice(2)))`; `run()`
  returns a `number` and today rejects any command other than `build`/`check`
  via `if (args.command !== "build" && args.command !== "check")`. `parseArgs`
  returns a typed `ParsedArgs` and handles `--out`/`--tokens`/`--data` plus one
  positional (`dir`). Error convention: `process.stderr.write(message + "\n")`
  and `[ADX] <path> - <reason>` messages. The only runtime dep is `acorn`.
- `package.json`: `"name": "adx"`, `bin: { "adx": "dist/cli.js" }`,
  `files: ["dist","tokens","README.md"]`, `scripts.build = "tsc -p tsconfig.json"`,
  `test = "vitest run"`, `lint = "eslint ."`. Version `0.1.0-alpha`.
- `.github/workflows/ci.yml`: `name: CI`; `on: [push, pull_request]`;
  `permissions: contents: read`; one job `verify` on `ubuntu-latest` with a
  node matrix `[22, 24]`, `actions/checkout@v4`, `actions/setup-node@v4`
  (`node-version`, `cache: npm`), then `npm ci`, `npm run build`, `npm run lint`,
  `npm test`, `npm run benchmark`, a `git diff` gate, playwright install, and
  `npm run test:browser`. Two-space YAML indent; `- run:` step style.
- README currently opens with Core Philosophy then a `npm ci`-based Quick Start
  (no `npm install adx` line exists yet). It keeps honest-claims language
  (0.1.0-alpha; measured ~13.3-13.8%, 60-80% a target).
- Package/install-name references that are user-facing distribution docs live in
  `docs/roadmap.md` ("Distribution" section: `npm install -g adx`, "one npm
  package (`adx`)") and `docs/agent-reference.md` (Compilation: "package `adx`").
  Internal metadata files (`.kiro/steering/structure.md`, `.agents/tasks/*`,
  `benchmark/README.md`, `m2-design.md`) also say package `adx` but are NOT
  distribution/install docs — treat them as out of scope for the surgical rename
  (see item 10). Confirm no new `npm install adx` strings exist elsewhere before
  finishing (item 10).
- Verified externally: for a package whose bin name differs from its package
  name, the working no-install form is `npx -p <package> <binary>` — i.e.
  `npx -p project-adx-0 adx build ...`
  ([npm docs](https://docs.npmjs.com/cli/v8/commands/npx/)). Content was
  rephrased for compliance with licensing restrictions.

Baseline verification (run FIRST, record output): from the repo root run
`npm ci` (or `npm install`), then `npm run build && npm run lint && npm test`.
All must pass before any edit so regressions are attributable. This is the same
command set each later item re-runs.

---

- [ ] 1. Extend `ParsedArgs` and `parseArgs` in `src/cli.ts` to carry `serve` options without touching existing fields.
      Add two optional fields to the `ParsedArgs` interface: `port: number | undefined` and `host: string | undefined`
      (keep explicit types, no `any`). In `parseArgs`, initialize both to `undefined` in the `parsed` object literal.
      In the arg loop add two branches BEFORE the final `else if (!arg.startsWith("--") ...)` positional branch:
      `--port` -> parse the next token with `Number(...)`, assign only if it is a finite integer > 0 (otherwise leave
      `undefined` so item 4 can error); `--host` -> assign the next token (`rest[++i]`). Do not alter the `--out`,
      `--tokens`, `--data`, or positional handling. The positional branch continues to populate `dir` (serve's optional
      `[dir]` reuses it).
      Files: src/cli.ts
      Verify: `npm run build && npm run lint` succeed (tsc + eslint clean); `npm test` still passes (no behavior
      change yet for build/check).

- [ ] 2. Add the static server function `serve(args)` to `src/cli.ts` using only `node:http`, `node:fs`, `node:path`.
      Add imports from existing `node:fs`/`node:path` statements (e.g. `statSync`, `createReadStream`, `extname`,
      `normalize`, `sep`) and a new `import { createServer } from "node:http"`. Add NO package dependency (acorn stays
      the only runtime dep). Implement `function serve(args: ParsedArgs): void` that:
      (a) resolves the served root: `const root = resolve(args.dir ?? "dist")`;
      (b) picks `const port = args.port ?? 3000` and `const host = args.host ?? "localhost"`;
      (c) defines a `CONTENT_TYPES: Record<string, string>` map covering `.html`→`text/html; charset=utf-8`,
          `.css`→`text/css; charset=utf-8`, `.js`→`text/javascript; charset=utf-8` (ES-module glue), `.json`,
          `.svg`→`image/svg+xml`, `.png`, `.ico`→`image/x-icon`, with `application/octet-stream` fallback;
      (d) creates the server with a request handler that: rejects non-GET/HEAD with 405; decodes the URL pathname
          (`decodeURIComponent(new URL(req.url ?? "/", "http://localhost").pathname)`), guarding malformed
          encoding with 400; resolves the target with `resolve(root, "." + pathname)` and REJECTS traversal by
          verifying the resolved path equals `root` or begins with `root + sep` — else 403 (security requirement);
          serves `index.html` for directory targets (pathname ending in `/` or `statSync` says directory); 404s
          with a short plain-text body when the file is missing; otherwise streams the file with the mapped
          `Content-Type` (for HEAD, end the response without the body);
      (e) calls `server.listen(port, host, () => process.stdout.write(\`ADX serving ${root} at http://localhost:${port}/\n\`))`
          and RETURNS (no `process.exit`; the listening server keeps the event loop alive).
      Match the existing comment style and `[ADX] ...`/stderr conventions for any error written to the client log.
      Files: src/cli.ts
      Verify: `npm run build` compiles; `npm run lint` clean. Manual smoke (optional, record result):
      `node dist/cli.js build fixtures/user-card --data fixtures/user-card/data.json --out /tmp/adx-site`
      then `node dist/cli.js serve /tmp/adx-site/user-card &`, `curl -sS http://localhost:3000/` returns the
      component HTML and `curl -sS 'http://localhost:3000/../../etc/passwd' -o /dev/null -w '%{http_code}'`
      returns 403; kill the server afterward.

- [ ] 3. Wire `serve` into dispatch WITHOUT changing build/check exit behavior, and restructure the bottom of the file.
      In `run()`, add a `serve` branch BEFORE the existing `build`/`check` guard: `if (args.command === "serve") { serve(args); return 0; }`
      — but note the real control change belongs at the bottom (see below), because `serve` must not go through
      `process.exit`. Preferred structure: keep `run()` returning a number for `build`/`check` exactly as today
      (including the `command !== "build" && command !== "check"` usage-error path and the `!args.dir` message —
      those must stay byte-for-byte for build/check inputs). Replace the final line
      `process.exit(run(process.argv.slice(2)))` with a small `main()` that parses once:
      parse argv; if `command === "serve"` call `serve(args)` and return (no exit); otherwise call
      `process.exit(run(argv))`. Keep a single `parseArgs` call per invocation. Ensure the usage-error and
      missing-dir paths for non-serve commands still return exit code 1 via `process.exit`.
      Guard: `serve` with a missing/invalid `--port` (left `undefined` by item 1 only when the user passed a
      bad value vs. omitted) — decide to treat a bad `--port` value as a fatal `[ADX] --port <v> - invalid port`
      on stderr with exit 1; omitted `--port` uses the 3000 default. (Implement this check in `main()` or at the
      top of `serve`, writing to stderr and `process.exit(1)` only for the invalid-value case.)
      Files: src/cli.ts
      Verify: `npm run build && npm run lint && npm test` all pass. Behavior checks (record output):
      `node dist/cli.js check fixtures/site/index.json` prints `OK` exit 0;
      `node dist/cli.js` (no args) prints usage to stderr exit 1;
      `node dist/cli.js bogus` prints usage exit 1 — identical to pre-change output.

- [ ] 4. Update `usage()` and the top-of-file doc comment in `src/cli.ts` to include `serve`.
      Add to the `usage()` array a line: `"  adx serve [dir] [--port 3000] [--host localhost]"` placed after the
      `check` line (keep the two-space indent and style). Extend the leading block comment that today documents
      only `build`/`check` with a short `adx serve` paragraph matching the existing comment voice (static server
      for already-compiled output; does not compile; default `dist`, port 3000, host localhost; long-running).
      Files: src/cli.ts
      Verify: `npm run build && npm run lint` clean; `node dist/cli.js` shows the new `serve` line in usage;
      `npm test` still green (if a test asserts exact usage text, update that test in the same change — search
      `test/` for `Usage:` first and adjust the expected string to include the serve line).

- [ ] 5. Add/confirm unit test coverage for `serve` arg parsing and the server, if the project pattern supports it.
      Search `test/` for existing CLI tests (e.g. a cli parseArgs/dispatch suite). If `parseArgs` is exported or
      testable, add cases asserting `--port`/`--host` parse into `ParsedArgs` and that `serve` is accepted. Add a
      small http test that starts `serve` on an ephemeral port against a temp dir with an `index.html`, asserts a
      200 + correct `Content-Type` for `/` and `/x.js` (`text/javascript`), a 404 for a missing file, and a 403
      for a `..` traversal attempt; close the server in teardown. Follow the existing Vitest style/fixtures used
      by neighboring tests. If `parseArgs`/`serve` are not currently exported, export them minimally (named
      exports) without changing `run()`'s signature or the `process.exit` entrypoint.
      Files: test/ (new or existing CLI test file), src/cli.ts (add named exports only if needed)
      Verify: `npm test` passes including the new cases; `npm run lint` clean.

- [ ] 6. Rename the npm package and add publish config in `package.json`.
      Change `"name": "adx"` to `"name": "project-adx-0"`. Keep `bin` exactly `{ "adx": "dist/cli.js" }`. Keep
      `files` as `["dist","tokens","README.md"]` (confirm all three present). Add to `scripts`:
      `"prepublishOnly": "npm run build"`. Add a top-level `"publishConfig": { "access": "public" }`. Leave
      `version` at `0.1.0-alpha` (the workflow handles already-published, so no bump required). Do not touch
      other scripts, deps, or engines.
      Files: package.json
      Verify: `node -p "require('./package.json').name"` prints `project-adx-0`;
      `node -p "require('./package.json').bin.adx"` prints `dist/cli.js`;
      `npm run build && npm run lint && npm test` all pass; `npm pack --dry-run` lists only dist/, tokens/,
      README.md contents and shows package name `project-adx-0`.

- [ ] 7. Create the publish-on-main workflow `.github/workflows/publish.yml`, mirroring ci.yml style.
      Two-space YAML indent, `- run:`/`- uses:` step style like ci.yml. Content:
      `name: Publish`; `on: push: branches: [main]`; `permissions: contents: read`; one job (e.g. `publish`) on
      `ubuntu-latest`. Steps: `actions/checkout@v4`; `actions/setup-node@v4` with `node-version: 22`,
      `registry-url: 'https://registry.npmjs.org'`, `cache: npm`; `npm ci`; `npm run build`; `npm test`
      (deliberately NOT running `npm run benchmark` or `test:browser`, to keep publish fast). Final guarded
      publish step (single shell `run:` block) that reads the local version and only publishes when npm has no
      such version:
      ```
      - name: Publish if version is new
        run: |
          VERSION="$(node -p "require('./package.json').version")"
          PUBLISHED="$(npm view project-adx-0@"$VERSION" version 2>/dev/null || true)"
          if [ -z "$PUBLISHED" ]; then
            npm publish
          else
            echo "project-adx-0@$VERSION already published; skipping."
          fi
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      ```
      (The guard must not fail when the version exists; `|| true` + empty-check handles both "not found" and a
      clean empty result.)
      Files: .github/workflows/publish.yml
      Verify: `node -e "const y=require('fs').readFileSync('.github/workflows/publish.yml','utf8'); require('child_process')"`
      is not sufficient — instead validate YAML parses: run
      `npx --yes js-yaml .github/workflows/publish.yml >/dev/null` (or `python3 -c "import yaml,sys;yaml.safe_load(open('.github/workflows/publish.yml'))"`)
      and confirm no error. Confirm by reading the file that the guard uses `project-adx-0`, the env sets
      `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`, and benchmark/browser steps are absent.

- [ ] 8. Rewrite `README.md` for AI-first install + the serve workflow, preserving honest claims and existing links.
      Add a prominent Install section near the top (just under the intro, before or just after Core Philosophy):
      global install `npm install -g project-adx-0` installs the global `adx` CLI; also show the no-install form
      `npx -p project-adx-0 adx build ...` (explain the bin name `adx` differs from the package name, which is why
      `-p` is required). Add a CLI surface section emphasizing build and serve:
      `adx build <componentDir|page.json> [--out dist] [--tokens <path>] [--data <file.json>]`;
      `adx serve [dir] [--port 3000] [--host localhost]` (serve already-compiled output locally);
      `adx check <componentDir|page.json> [--tokens <path>] [--data <file.json>]`.
      Add a minimal end-to-end example: install globally, build the `user-card` fixture to `dist/`
      (`adx build fixtures/user-card --data fixtures/user-card/data.json --out dist`), then `adx serve dist` and
      open the printed `http://localhost:3000/` URL. Keep the existing `npm ci`/`node dist/cli.js` Quick Start as
      the from-source path (or clearly label the two paths). Preserve the measured-claims paragraph
      (13.3-13.8%, 60-80% target not demonstrated), the trust-boundary note, the Essential Guides links table, and
      the Status section — do not overstate. Add a short note that the package publishes to npm automatically from
      `main` via GitHub Actions. Update the Status/Next line only to stay consistent (serve now ships; dev server
      with hot reload still planned).
      Files: README.md
      Verify: read the rendered file top-to-bottom; confirm it contains `npm install -g project-adx-0`,
      `npx -p project-adx-0 adx`, the `adx serve` line, the end-to-end example, and that no claim exceeds the
      measured range. Run `npm run lint` (unaffected) and confirm existing doc links in the file still point to
      the same paths.

- [ ] 9. Sync `docs/agent-reference.md` and `docs/human-guide.md` for the new `serve` command.
      agent-reference.md Compilation section: add `adx serve [dir] [--port <n>] [--host <h>]` to the IMPLEMENTED
      block with a one-line description (serve compiled output locally; static, no compile), keeping the compact
      aligned-comment style; it currently lists build/check IMPLEMENTED and `adx dev` under PLANNED (leave `adx dev`
      planned). human-guide.md CLI Commands section ("Working today (M1 + M2)" block): add an `adx serve <dir>`
      line in the warmer tone describing local preview of built output; optionally add a one-sentence note near the
      build example that `adx serve dist` previews the result in a browser.
      Files: docs/agent-reference.md, docs/human-guide.md
      Verify: read both edited sections; confirm `serve` appears under IMPLEMENTED/working-today (not planned) and
      `adx dev`/hot-reload remains planned. No build/test impact (docs only); still run `npm test` once to confirm
      nothing references these files in snapshot form.

- [ ] 10. Surgical package-name rename in distribution docs + repo-wide install-name check.
      docs/roadmap.md "Distribution (how users get it)" section: update to say automated publish-on-main via
      GitHub Actions is now configured, the package name is `project-adx-0` (CLI command stays `adx`), and change
      `npm install -g adx` to `npm install -g project-adx-0`. If serve was described only as a planned dev server,
      clarify a static `adx serve` (preview only, no hot reload/compile) now ships while the full dev server with
      hot reload remains planned. docs/agent-reference.md: the "package `adx`" phrase in the Compilation intro
      refers to the published package name — update it to `project-adx-0` (do NOT change the CLI command `adx`).
      Then grep the whole repo for install/package-name usages and fix ONLY distribution/install docs:
      run `grep -rn -E "npm install (-g )?adx|package \`adx\`|install.{0,6}adx" --include='*.md' .` and update
      user-facing install strings to `project-adx-0`. Do NOT change: the CLI command `adx`, `bin: { "adx": ... }`,
      the `@adx/patterns` planned import, `data-adx-*` attributes, `.adx`/`.structure.adx`/`behavior.adx.js`
      extensions, token names, the display name "ADX", or internal metadata files (`.kiro/steering/*`,
      `.agents/tasks/*`, `benchmark/README.md`, `m2-design.md`) — those are not distribution docs. Keep the README
      roadmap/status row consistent with roadmap.md.
      Files: docs/roadmap.md, docs/agent-reference.md (and any other *.md that contains a user-facing
      `npm install adx` install string the grep surfaces)
      Verify: `grep -rn -E "npm install (-g )?adx\b" --include='*.md' .` returns no hits in distribution docs
      (README, docs/*); confirm the CLI command `adx`, `@adx/patterns`, `data-adx-*`, `.adx` extensions, and
      token names are untouched by re-reading the diffs.

- [ ] 11. Final full verification pass.
      Run the complete project gate exactly as CI does for the relevant steps and confirm clean:
      Files: (none — verification only)
      Verify: `npm ci` then `npm run build && npm run lint && npm test` all pass; `npm pack --dry-run` shows
      package `project-adx-0` with only dist/tokens/README.md; `node dist/cli.js serve /tmp/adx-site &` prints the
      `ADX serving ... at http://localhost:3000/` line and serves `curl http://localhost:3000/` (200) while a
      `..` traversal returns 403; `node dist/cli.js check fixtures/site/index.json` still prints `OK`. Kill any
      backgrounded server and remove temp files.

## Verification evidence (iteration 2 — review fixes)

Run from repo root; exit codes are the real process exits (ignore the harness's
piped `-1` artifacts).

- `tsc -p tsconfig.json` → exit 0 (build clean).
- `eslint .` → exit 0 (lint clean).
- `vitest run` → exit 0; **22 files, 209 tests passed** (includes new
  `test/serve.test.ts`, 11 cases: parseArgs serve options incl. build/check
  non-consumption of `--port`/`--host`, 200+text/html, 200+text/javascript for
  `.js`, 404, 405, HEAD-no-body, literal `..` 403, encoded-slash 403).
- `npm pack --dry-run` → package `project-adx-0@0.1.0-alpha`, files limited to
  `dist/`, `tokens/`, `README.md`.
- Manual serve end-to-end (`node dist/cli.js build fixtures/user-card --data
  fixtures/user-card/data.json --out /tmp/adx-serve-test` then
  `serve .../user-card --port 4567`, backgrounded, then killed):
  - startup printed `ADX serving /tmp/adx-serve-test/user-card at http://localhost:4567/`.
  - `/` → 200, `text/html; charset=utf-8`, body contained `<title>UserCard</title>`.
  - `/glue.js` → 200, `text/javascript; charset=utf-8`.
  - `curl --path-as-is /../../etc/passwd` → **403**, 0 leaked `root:` lines.
  - encoded-slash `/..%2f..%2fetc/passwd` → 403; encoded-dot `/%2e%2e/%2e%2e/…` → 403.
  - `/missing.css` → 404; `POST /` → 405.
  - invalid `--port abc` → `[ADX] --port abc - invalid port` exit 1;
    `--port 70000` → `[ADX] --port 70000 - invalid port` exit 1;
    second serve on an in-use port → `[ADX] serve - EADDRINUSE` exit 1 (no stack);
    `--host 0.0.0.0` announced `http://localhost:4569/`.
- Behavior preservation: `check fixtures/site/index.json` → `OK` exit 0; no-args
  and `bogus` → usage exit 1; `build --host fixtures/user-card` still treats the
  path as the positional dir (compiles `fixtures/user-card`) — the pre-change
  behavior, confirming the parser regression is fixed.
- `.github/workflows/publish.yml` parsed clean via `js-yaml`; guard publishes
  only when `npm view project-adx-0@<version>` is empty.
- `package-lock.json` root name regenerated to `project-adx-0` (only the two
  `name` fields changed; no dependency churn).

Review blocking findings addressed: (1) serve-only `--port`/`--host` scoping;
(2) README "Publishing setup (maintainers)" section with npm token + GitHub
secret steps; (3) lockfile root identity; (4) roadmap tag-gate wording. Also
addressed non-blocking: listen error handler + full port-range validation,
host-aware startup announcement, raw-path `..` 403 contract, serve test
coverage, and loopback/symlink doc note.

## Verification evidence (iteration 3 — review fixes)

Two blocking findings from `npm-serve-review.json` fixed:

- **Entrypoint guard breaks the installed CLI (blocking)** — `src/cli.ts`: the
  entrypoint guard previously used `resolve(process.argv[1]) === fileURLToPath(
  import.meta.url)`, a lexical compare that is false under an npm bin symlink,
  so `adx build`/`serve`/`check` silently no-op'd (exit 0) when run as the
  globally-installed `adx` or via `npx -p project-adx-0 adx`. Fixed with an
  `isEntryPoint()` helper that canonicalizes `process.argv[1]` via
  `realpathSync` (wrapped in try/catch so a nonexistent/odd argv[1] returns
  false) and compares against the already-realpathed `import.meta.url`.
- **Collision-prone serve tests (blocking)** — `test/serve.test.ts` previously
  chose a random fixed port (30000–49999); a collision would trip the server's
  error handler and `process.exit(1)` the Vitest worker. The server test now
  passes `port: 0` directly to `serve()` (parseArgs's `--port` validation still
  rejects 0 as a user value, so the args object is built inline) and reads the
  OS-assigned port from `server.address()` after `listening`.

Low/informational findings reviewed and intentionally not code-changed: prerelease
`latest` dist-tag (acceptable while 0.1.0-alpha is the only version), symlink
escape (lexical containment; documented assumption, preview over compiler output),
`--host 0.0.0.0` LAN exposure (documented in the serve help comment, default is
loopback), no `concurrency` guard (version guard already blocks duplicate
publishes), and the extra `serve` usage line (intended; no test asserts the string).

Commands run from repo root (exit codes are the real process exits; the harness's
piped `-1` is an artifact):

- `npm run build` → exit 0.
- `npm run lint` → exit 0.
- `npm test` → exit 0; **22 files, 209 tests passed** (serve suite green with the
  port-0 ephemeral-binding fix).
- Symlinked-bin smoke (the exact path the fix restores): `ln -s $PWD/dist/cli.js
  /tmp/adx-link` then
  - `node /tmp/adx-link` → usage to stderr, exit 1 (was: no output, exit 0).
  - `node /tmp/adx-link bogus` → usage, exit 1 (was: no output, exit 0).
  - `node /tmp/adx-link check fixtures/user-card` → `[ADX] manifest.json -
    Missing required prop "name"` exit 1 (dispatch now runs; was: silent exit 0).
  - `node /tmp/adx-link build fixtures/user-card --data fixtures/user-card/data.json
    --out /tmp/adx-serve-test` → `Built UserCard`, exit 0.
- Manual serve end-to-end through the symlinked bin (`serve .../user-card --port
  4567 --host 127.0.0.1`, backgrounded then killed):
  - startup printed `ADX serving /tmp/adx-serve-test/user-card at http://127.0.0.1:4567/`.
  - `/` → 200, `text/html; charset=utf-8`, body contained `<title>UserCard</title>`.
  - `/glue.js` → 200, `text/javascript; charset=utf-8`.
  - `/../../etc/passwd` (curl `--path-as-is`) → 403, 0 leaked `root:` lines.
  - `/nope.css` → 404; `POST /` → 405. Server killed; `/tmp/adx-serve-test` removed.
- `.github/workflows/publish.yml` parsed clean via `npx js-yaml`; guard publishes
  only when `npm view project-adx-0@<version>` is empty.

## Assumptions & notes
- Invalid `--port` handling (bad value vs omitted) is a small design choice item 1/3
  resolve: omitted -> 3000 default; explicitly bad value -> fatal `[ADX] --port ...`
  exit 1. If an implementer prefers to silently fall back to 3000 for bad values,
  that is acceptable so long as build/check are untouched; the explicit-error path
  is the recommended behavior because it matches the `[ADX] ...`/stderr convention.
- Node version: publish.yml uses Node 22 per the task; `engines` stays `>=18`. CI's
  matrix (22/24) is unchanged — do not edit ci.yml.
- The honest-claims language (13.3-13.8% measured; 60-80% a target) must survive the
  README rewrite verbatim in substance; do not round up or restate it as achieved.
