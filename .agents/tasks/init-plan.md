# Implementation Plan — `adx init [name]` project scaffolding

Goal: add a fourth CLI subcommand `adx init [name]` that scaffolds a minimal, complete, buildable + servable ADX starter project, without regressing `build`/`check`/`serve`. Plus Vitest coverage and doc sync.

## Design decisions (made during exploration, grounded in the code)

- **Templates live in a new module `src/scaffold.ts` as embedded string constants, not read from disk.** `package.json#files` ships only `dist`, `tokens`, `README.md`; a global install has no `fixtures/`. Reading templates at runtime would break the installed CLI, so every scaffolded file's content is an exported constant. Only `node:fs`/`node:path` are used (no new deps), consistent with `src/cli.ts`.
- **`init` is one-shot and routes through `run()`, not `serve`.** `main()` already does `process.exit(run(args))` for everything except `serve`; `serve` is the only long-running branch. `run()` currently hard-rejects any command that is not `build`/`check` (`if (args.command !== "build" && args.command !== "check")`). I will widen that dispatch to also handle `init`, keeping the same try/catch → `[ADX]` stderr + exit-1 convention that `build`/`check` use.
- **No new global flags.** `init` only needs the project name, which `parseArgs` already captures as `parsed.dir` (first non-`--` positional). The serve-only `--port`/`--host` scoping (`const isServe = command === "serve"`) stays byte-for-byte unchanged, so `adx build --host x dir` still treats `dir` as the positional. `init` reads the positional via `args.dir`; no `parseArgs` changes are required beyond nothing — confirm by test that build/check parsing is unchanged.
- **Target directory resolution.** `adx init <name>` → `resolve(name)`; `adx init` or `adx init .` → `resolve(".")` (CWD). Create with `mkdirSync(target, { recursive: true })` as the task requires.
- **Clobber guard writes nothing on conflict.** Build the full list of relative output paths first, resolve each against the target, and if ANY already exists, throw `[ADX] <path> - ...` BEFORE creating dirs or writing any file. Empty/non-existent target is fine.
- **Starter component `hello-card` has only props WITH defaults.** `src/compile.ts` `resolveProps` throws `Missing required prop` when a `required` prop has no default; the standalone build runs with no `--data`. So the manifest declares `title` and `message` as `string` with defaults and NO `required: true`. This guarantees `adx build hello-card` succeeds with no data. Model the four files on `fixtures/user-card/*` syntax exactly (`.class`, `:attr`, `@click`, `{{interp}}`, `:if`, `@use tokens`, abbreviated CSS props). Avoid slots to keep it minimal (slots need a parent to project; a standalone build of a component with an unfilled `<slot>` is unnecessary surface area).
- **Only real tokens.** The style file uses only token names present in `tokens/design-tokens.json` (e.g. `space-4`, `surface-0`, `radius-lg`, `shadow-md`, `text-xl`, `text-base`, `text-1`, `text-2`, `weight-bold`). The scaffolded `tokens/design-tokens.json` is the repo token file's exact content embedded as a string constant so it resolves regardless of CWD.
- **Starter page `index.json`.** Slug `index` (matches `^[a-z0-9]+(?:-[a-z0-9]+)*$` and maps to site root per `page/compile.ts`), with required `page`/`title`/`description`, plus `lang` optional. One component entry `{ "use": "./hello-card", "data": {...} }` pointing at the relative starter dir with inline data. `canonical` is optional (loader defaults it for `index` to `/`), mirror `fixtures/site/index.json` which omits it.
- **Project `README.md`** explains the component build, page build, and `adx serve`. No `package.json`/`node_modules` scaffolded (task requirement).
- **Success output** lists created files and prints exact next steps: an install/usage note, `adx build hello-card --out dist`, `adx build index.json --out dist` (page), and `adx serve dist` (page → site root) / `adx serve dist/hello-card` (component). Exit 0.

## Scaffold file set (the clobber-guard list)

For target `T` (and project base name `B` = `basename(T)`), these relative paths are written:
- `hello-card/manifest.json`
- `hello-card/structure.adx`
- `hello-card/behavior.adx.js`
- `hello-card/style.adx.css`
- `tokens/design-tokens.json`
- `index.json`
- `README.md`

(7 files, 2 dirs.) `B` is only used in printed next-step text / README prose, not in paths.

---

## Steps

- [ ] 1. Create `src/scaffold.ts` with the embedded templates and the scaffold writer.
      Export `SCAFFOLD_FILES: { path: string; contents: string }[]` (the 7 relative paths above, contents as template constants) and a function `scaffoldProject(targetDir: string, projectName: string): string[]` that: (a) resolves each file path against `targetDir`; (b) if ANY resolved path already `existsSync`, throws `new Error(\`[ADX] \${conflictPath} - already exists; refusing to overwrite\`)` having written nothing; (c) otherwise `mkdirSync(dir, { recursive: true })` per unique parent and `writeFileSync` each file; (d) returns the list of written relative paths. Token JSON constant = exact current content of `tokens/design-tokens.json`. Component templates modeled on `fixtures/user-card/*` but minimal with defaulted props only (see design decisions). Use only `node:fs` (`existsSync`, `mkdirSync`, `writeFileSync`) and `node:path` (`resolve`, `join`, `dirname`).
      Files: `src/scaffold.ts` (new)
      Verify: `npm run build` compiles with no TS/eslint-type errors (`tsc -p tsconfig.json` exits 0).

- [ ] 2. Wire `adx init` into the CLI dispatch in `src/cli.ts`.
      Add a `runInit(args: ParsedArgs): number` that resolves the target (`args.dir ?? "."`, treating `.` as CWD), derives `projectName = basename(resolve(target))`, calls `scaffoldProject`, then writes the created-files list + exact next-step commands to stdout and returns 0. Widen `run()` so its guard accepts `init` too (e.g. dispatch `init` before the build/check branch, inside the same `try/catch` so a thrown `[ADX]` clobber error becomes stderr + exit 1). Do NOT touch `parseArgs`, `serve`, `main`'s serve branch, or `isEntryPoint`. Add the `init` line to `usage()`. Add an `init` entry to the top-of-file subcommand doc comment block, matching the existing `build`/`check`/`serve` comment style.
      Files: `src/cli.ts`
      Verify: `npm run build` exits 0; then end-to-end — `node dist/cli.js init /tmp/adx-demo-$$ && node dist/cli.js build /tmp/adx-demo-$$/hello-card --out /tmp/adx-demo-$$/dist && node dist/cli.js build /tmp/adx-demo-$$/index.json --tokens /tmp/adx-demo-$$/tokens/design-tokens.json --out /tmp/adx-demo-$$/dist && node dist/cli.js check /tmp/adx-demo-$$/hello-card` all exit 0 and the component `index.html` contains the starter greeting text; then re-running `node dist/cli.js init /tmp/adx-demo-$$` exits 1 with an `[ADX] ... already exists` message and overwrites nothing. Clean up `/tmp/adx-demo-$$`.

      Note on `--tokens` for the page build: `compilePage`/`compileComponent` default `tokensPath` to `tokens/design-tokens.json` relative to CWD. From an arbitrary CWD the scaffolded project's tokens must be reachable — the generated README and the printed next steps must either `cd <project>` first (so the default path resolves) or pass `--tokens tokens/design-tokens.json`. Make the printed next steps and README consistent with whichever is used, and ensure the e2e verification above resolves tokens correctly (shown with explicit `--tokens` for the page; a `cd`-based flow is equivalent).

- [ ] 3. Add `test/init.test.ts` (Vitest) covering structure, clobber guard, and end-to-end compile.
      Follow `test/serve.test.ts` / `test/compile.test.ts` patterns: `mkdtempSync(join(tmpdir(), "adx-init-"))` in `beforeEach`, `rmSync(..., { recursive: true, force: true })` in `afterEach`. Import `scaffoldProject` (and/or `SCAFFOLD_FILES`) from `../src/scaffold.js` and `compileComponent` from `../src/compile.js`. Tests:
      (a) scaffolding into a temp dir creates all 7 files (assert each exists: the four `hello-card/*`, `tokens/design-tokens.json`, `index.json`, `README.md`).
      (b) clobber guard: pre-create one target file (e.g. `index.json`) in the temp dir, then expect `scaffoldProject` to throw matching `/^\[ADX\] .* already exists/`, and assert no OTHER scaffold file was created (e.g. `hello-card/manifest.json` still does not exist).
      (c) end-to-end: after scaffolding, call `compileComponent(join(dir, "hello-card"), { tokensPath: join(dir, "tokens", "design-tokens.json") })` and assert `result.html` contains the real greeting text baked by `setup()` (proves no required-prop failure and that embedded tokens resolve — mirror the `expect(html).toMatch(...)` style in compile.test.ts). Optionally also compile the page via `compilePage(join(dir, "index.json"), { tokensPath: ... })` and assert its html contains the greeting.
      Do NOT modify existing tests.
      Files: `test/init.test.ts` (new)
      Verify: `npm test` — all 209 existing tests still pass and the new `init` tests pass; `npm run lint` exits 0.

- [ ] 4. Sync `docs/agent-reference.md`.
      Move project scaffolding from PLANNED to IMPLEMENTED: in the CLI block, remove scaffolding from the `# PLANNED` list (keep `adx dev`, `adx tokens`, `adx pattern` planned) and add `adx init [name]` to the working-commands section with a one-line description. Update the `COMPONENT CREATION` quick-reference to mention `adx init` as the fast path to a new project/component. Update the "Not implemented: ... scaffolding ..." sentence near the top to drop scaffolding (since it now ships) while leaving the other not-implemented items. If the previously-planned name was `adx create`, note the shipped command is `adx init`. Keep the compact token-efficient style.
      Files: `docs/agent-reference.md`
      Verify: re-read the edited sections; confirm no remaining claim that scaffolding is unimplemented and that `adx init` appears in the working CLI list. (`npm run build`/`npm test` still green — docs don't affect them, but run `npm test` once after all doc edits to confirm nothing references removed text.)

- [ ] 5. Sync `docs/human-guide.md`.
      Add a short, friendly "Start a new project" subsection showing `adx init my-app` then `cd my-app`, build the component/page, and `adx serve dist`, matching the guide's warm tone. In the `## CLI Commands` block, move `adx init` from the `# Planned` list into "Working today" (keep `adx create`/`adx dev`/`adx tokens`/`adx pattern` planned if still unbuilt — note `init` is the shipped scaffolder). Update the earlier line that says "`adx create` and `adx dev` are not available yet" to reflect that `adx init` now exists.
      Files: `docs/human-guide.md`
      Verify: re-read edited sections; `adx init` present in working list, planned list no longer implies scaffolding is entirely absent.

- [ ] 6. Sync `docs/roadmap.md`.
      Reflect that `adx init` scaffolding now ships (e.g. a short "Shipped" note or flipping the relevant status), while keeping `adx create`/`adx dev`/`adx tokens`/`adx pattern` in the still-planned "Later milestones (unscheduled)" list for anything genuinely unbuilt. Keep status-language convention (✅/🚧/❌).
      Files: `docs/roadmap.md`
      Verify: re-read; `adx init` noted as shipped, remaining planned CLIs intact.

- [ ] 7. Sync `README.md`.
      Add `adx init [name]` to the `## CLI` section (with a one-line description). Put `adx init` at the top of the `### End-to-end example` flow so it reads init → build → serve. Update the `## Status` → `Available:` line to mention project scaffolding via `adx init`, and the `not implemented` tail so scaffolding is no longer listed as unimplemented (keep hot reload / patterns / lifecycle honest). Keep the honest `0.1.0-alpha` status.
      Files: `README.md`
      Verify: re-read; `adx init` in CLI section and example; Status/Available mentions scaffolding; no stale "scaffolding ... not implemented".

- [ ] 8. Final full verification gate.
      Run the whole bar end-to-end and clean up.
      Files: none
      Verify, all exiting 0: `npm run build`; `npm run lint`; `npm test` (existing suite green + new init tests pass). Then in a temp dir via the BUILT CLI: `node dist/cli.js init demo-app` (in a scratch CWD), a component build, a page build (`demo-app/index.json`), and `check` all succeed with the real compiler/tokens producing an `index.html` containing the real greeting text; re-running `init demo-app` into the populated dir fails with the `[ADX]` clobber error exit 1, nothing overwritten. Confirm `build`/`check`/`serve` arg parsing is unchanged (the existing `parseArgs` tests in `test/serve.test.ts` still pass). Remove all `/tmp` artifacts and leave no hanging `serve` processes.

## Notes / assumptions

- The greeting text asserted in tests must be a literal that `setup()` returns into an interpolated element (e.g. `<h2>{{title}}</h2>` or `<p>{{message}}</p>`), so it appears verbatim in the compiled HTML. Pick a distinctive default (e.g. title "Hello, ADX" / message "Welcome to your new ADX project.") and assert on it.
- Keep the `[ADX] <path> - ...` stderr convention and exit-code-1-on-error identical to `build`/`check` (the shared `run()` try/catch already does this once `init` is dispatched inside it).
- This change is a single cohesive unit (CLI + scaffold module + tests + docs) and is implemented directly on `main` in the repo root — no worktree, no FEAT decomposition. Commit happens in the review loop on approval.

---

## Verification note (iteration 1)

All gates green:

- `npm run build` → exit 0 (tsc, no errors).
- `npm run lint` → exit 0 (eslint).
- `npm test` (vitest run) → exit 0, **213 passed** (209 pre-existing + 4 new in `test/init.test.ts`). Existing suite unchanged; `test/serve.test.ts` parseArgs tests (incl. the "does NOT consume --port/--host for build/check" case) still pass, confirming build/check/serve arg parsing is byte-for-byte unchanged.
- End-to-end through the BUILT CLI (`node dist/cli.js`) in an OS temp dir:
  - `init demo-app` → exit 0, created the 7 files (`hello-card/{manifest.json,structure.adx,behavior.adx.js,style.adx.css}`, `tokens/design-tokens.json`, `index.json`, `README.md`) + printed next steps.
  - `build hello-card` → exit 0; `build index.json` → exit 0 (page at site root); `check hello-card` and `check index.json` → exit 0.
  - `dist/index.html` contains the real greeting (`Hello, ADX` and `Welcome to your new ADX project.`), proving defaulted props resolve with no `--data` and embedded tokens resolve.
  - Re-running `init demo-app` into the populated dir → exit 1 with `[ADX] <path>/hello-card/manifest.json - already exists; refusing to overwrite`, nothing overwritten.
- Temp dirs removed; no hanging `serve` processes.

Implementation summary: new `src/scaffold.ts` (embedded templates + `scaffoldProject`/`SCAFFOLD_FILES`, clobber-guards before any write, node built-ins only); `src/cli.ts` gains the `init` dispatch (`runInit`), usage line, and top-of-file doc comment, leaving `parseArgs`/`serve`/`main`'s serve branch/`isEntryPoint` untouched; `test/init.test.ts` added; docs synced (`agent-reference.md`, `human-guide.md`, `roadmap.md`, `README.md`).

---

## Verification note (iteration 2 — review findings addressed)

Addressed all four findings from `init-review.json`:

- **BLOCKING — Missing root-page `<h1>`**: the starter `hello-card` now leads with `<h1 .title>` instead of `<h2>` (`src/scaffold.ts` STRUCTURE). For the single-card starter the card title IS the page's main heading, so the compiled `dist/index.html` now has exactly one `<h1>` and skips no heading level, satisfying the SEO/a11y baseline. The page compile test now pins the hierarchy (`h1Count === 1` and no `<h2>`).
- **BLOCKING — Undersized/feedback-free Dismiss control**: `.dismiss` gained `min-height: tokens.space-12` (48px, ≥ the 44px touch-target baseline), bumped text to `text-base`, and non-layout-shifting feedback via `.dismiss:hover` (background color → `secondary`) and `.dismiss:active` (opacity), with a `transition` on color/opacity only (no transform). The component compile test asserts `min-height` survives into the emitted CSS.
- **NON-BLOCKING — Embedded tokens hand-synced duplicate**: added a test asserting the scaffolded `tokens/design-tokens.json` is byte-identical to the repo's `tokens/design-tokens.json`, so drift fails CI instead of going silent.
- **NON-BLOCKING — CLI runInit layer untested**: added a `describe("adx init CLI dispatch")` block exercising `run({ command: "init", ... })` for bare-`init` → CWD resolution, `init <name>` → `./<name>` with a `cd` next-step, and the clobber path returning exit 1 with the `[ADX] ... already exists` stderr while writing nothing.

Gates (all green):

- `npm run build` → exit 0 (tsc).
- `npm run lint` → exit 0 (eslint).
- `npm test` (vitest run) → exit 0, **217 passed** (209 pre-existing + 8 in `test/init.test.ts`, up from 4). Existing suite unchanged; `test/serve.test.ts` parseArgs non-consumption case still passes → build/check/serve arg parsing byte-for-byte unchanged.
- End-to-end through the BUILT CLI (`node dist/cli.js`) in an OS temp dir: `init demo-app` → exit 0 (7 files + next steps); `build hello-card`, `build index.json`, `check hello-card`, `check index.json` → all exit 0; `dist/index.html` now leads with a single `<h1>Hello, ADX</h1>`, has zero `<h2>`, contains the greeting, and the emitted `style.css` contains `min-height`; re-running `init demo-app` → exit 1 with the `[ADX] <path>/hello-card/manifest.json - already exists` clobber error, nothing overwritten.
- Temp dirs removed; no hanging `serve` processes.
