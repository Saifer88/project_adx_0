# `adx tokens` and `adx help` CLI subcommands (re-review after fixes)

Two one-shot subcommands are added to the ADX CLI. `adx tokens [--tokens <path>]` prints every design token as `name = value`, grouped by category, to stdout; `adx help` prints the full six-command listing to stdout and exits 0. The default token source resolves to the package's bundled `tokens/design-tokens.json` via `import.meta.url` so a global install works from any CWD, while `--tokens` keeps CWD-relative resolution like `build`/`check`. The loader gained a `groups()` accessor so the listing is rendered from loader-owned data with a single read/parse. This pass re-reviews the state after the fix commit (`46656a0`) that addressed the four blocking findings from the prior review (`tokens-help-review.json`).

Watch for: nothing blocking. The four prior blocking findings are all resolved and verified (confirmed). One carried-over non-blocking item remains by design: a positional path after `adx tokens` is silently ignored (confirmed). One minor test gap: the CWD-independent default-path behavior is proven only by the recorded manual `/tmp` run, not by an automated test (confirmed).

**Verdict**: APPROVED

## High-level view

The default-token resolution is the load-bearing decision and it is correct. `runTokens` resolves `dirname(fileURLToPath(import.meta.url))` to `dist/`, climbs one level to the package root, and joins `tokens/design-tokens.json`. `package.json` ships both `dist` and `tokens` in its `files` array, so that path exists in a global install, and a spot-check `node dist/cli.js tokens` from `/tmp` prints the bundled set rather than looking in `process.cwd()`. The `--tokens` branch uses `resolve(args.tokens)`, which stays CWD-relative.

The prior "double read/parse" finding is genuinely fixed, not papered over. `parseTokens` now accumulates a `grouped: TokenGroup[]` alongside the flat map in the same loop, and `runTokens` renders from `table.groups()`. There is no second `readFileSync`/`JSON.parse` and the `RawTokens` import is gone from `cli.ts`. Because the loader stores raw values in both `flat` and `grouped` and performs no value-side normalization, `groups()` and `resolve()` return identical values — the display-divergence risk GPT raised is closed.

The help/usage split preserves existing exit-code contracts. `help` is an explicit request (stdout, exit 0); bare and unknown commands stay errors (stderr, exit 1). `usage()` was restored to the verbatim pre-tokens/help four-line literal, so `build`/`check`/`init` missing-target stderr is byte-for-byte unchanged; the full six-command listing with descriptions lives only in `helpText()`. Both strings still derive the command set from one `COMMANDS` source for the help path, so the full listing can't drift.

Arg parsing and the entry-point guard are untouched. `parseArgs` serve-flag scoping (only `serve` consumes `--port`/`--host`) and `isEntryPoint()` are unchanged, and the new `help`/`tokens` dispatch is added as early returns ahead of the existing build/check/init branch, leaving those paths on identical code.

<details>
<summary>Issues (2)</summary>

1. **Positional path ignored by `adx tokens`** — `adx tokens ./my.json` parses `./my.json` into `args.dir` and is silently discarded, falling back to the bundled set; only `--tokens` is honored. Matches the documented `adx tokens [--tokens <path>]` signature, so non-blocking, but a user typo could print the wrong tokens with no warning. Consider a future note or positional support.
2. **No automated test for CWD-independent default path** — the `import.meta.url` resolution that makes a global install correct is exercised only by the recorded manual `/tmp` run, not by a test. In-process `run()` tests pass regardless of CWD, so a regression that reintroduced a `process.cwd()`-relative default would not be caught. Consider a test that invokes the built `dist/cli.js` from a foreign CWD.

</details>

<details>
<summary>Details</summary>

### Default token path resolves to the installed package, not CWD

`runTokens` computes the default source as `resolve(dirname(fileURLToPath(import.meta.url)), "..", "tokens", "design-tokens.json")`. With `tsconfig` emitting `rootDir: src` → `outDir: dist`, the compiled module is `dist/cli.js`, so `dirname(...)` is `dist/` and `".."` is the package root — exactly where `tokens/design-tokens.json` lives. `package.json` lists both `dist` and `tokens` under `files`, so both ship to npm and the path resolves in a global install. The recorded `/tmp` run and a repeat spot-check here both print the bundled spacing/color/radius tokens from a foreign CWD, exit 0. The `--tokens` override instead uses `resolve(args.tokens)` (CWD-relative), matching how `build`/`check` treat their token paths. (confirmed)

### Grouped listing is rendered from loader-owned data, single read/parse

The prior blocking finding was that `runTokens` called `loadTokens` only as an error-path preflight, discarded the result, then re-read and re-parsed the file to recover category structure. That is fixed. `parseTokens` now builds `grouped` in the same pass that fills `flat`: for each category it collects `[name, value]` pairs into `groupEntries` and pushes `{ group, entries }` onto `grouped`, exposed via a new `groups()` method on `TokenTable` (and a new `TokenGroup` type). `runTokens` reads once through `loadTokens(path)` and renders from `table.groups()`; the second `readFileSync`/`JSON.parse` and the `RawTokens` import are gone. Since the loader stores raw values in both `flat` and `grouped` and only normalizes the *lookup key* (`tokens.` prefix stripping), never the value, `groups()` and `resolve()` yield the same strings — the "display semantics diverge from loader normalization" concern no longer applies. (confirmed)

`TokenTable` is implemented in exactly one place (`parseTokens`); every other reference (`compile.ts`, `context.ts`, `test/helpers.ts`) uses the type or `loadTokens`, none construct an object literal, so making `groups()` a required member breaks no mock. The recorded `npm run build` (exit 0) confirms the interface change compiles. (confirmed)

Within each group the name column is padded to the widest name before ` = ` and the value, giving the documented `name = value` row (e.g. `space-4  = 16px`). A missing/malformed file routes through the loader's throw, caught and normalized to the standard `[ADX] <path> - …` on stderr, exit 1 — the same shape as the other commands. (confirmed)

### help vs. usage: one source, preserved exit codes

`help` returns early in `run()` with `helpText()` to stdout and exit 0 — an explicit request, not an error. Bare `adx` and unknown commands fall through to the existing branch that writes `usage()` to stderr and returns 1. The critical fix: `usage()` was restored to the verbatim pre-change four-line literal (`build`/`check`/`init`/`serve`), which I confirmed byte-for-byte against the base commit (`8e42642`). So `build`/`check`/`init` missing-target errors — which embed `usage()` — emit identical stderr to before. The six-command listing with descriptions is confined to `helpText()`, built from the shared `COMMANDS` table. (confirmed)

### build/check/serve/init and arg parsing unchanged

`parseArgs` is unchanged: `--port`/`--host` are consumed only when `command === "serve"`, so `build --host fixtures/user-card` keeps `fixtures/user-card` positional (asserted by a new regression test). `isEntryPoint()` and the `serve` dispatch in `main()` are untouched. The new `help`/`tokens` handling sits as early returns before the build/check/init branch, so those commands reach the same code with the same behavior. (confirmed)

### Test coverage

`test/cli-commands.test.ts` (new) covers: the default `adx tokens` listing asserting real bundled rows with the required ` = ` delimiter (`/space-4\s+= 16px/`, `/primary\s+= #1d4ed8/`, `/radius-md\s+= 8px/`) and `spacing:`/`colors:` grouping, exit 0, stderr untouched; a `--tokens` override reflecting a temp file (also asserting the ` = ` delimiter); malformed and missing override files → `[ADX]` on stderr, exit 1; `adx help` listing all six command names on stdout, exit 0, stderr untouched; bare and unknown commands → `Usage:` on stderr, exit 1; the serve-flag-scoping regression; `tokens` reusing `--tokens`; and two regressions pinning `usage()` to the legacy literal and asserting it never mentions `tokens`/`help`. The delimiter is now genuinely asserted (the prior `\s+` patterns that accepted whitespace-only alignment were tightened to require the literal `= <value>`).

Not tested: the CWD-independent default-path behavior (the `import.meta.url` resolution) — in-process `run()` tests pass regardless of CWD, so this is proven only by the manual `/tmp` run, not an automated test. A regression to a `process.cwd()`-relative default would slip past the suite.

### Documentation sync

The doc changes are surgical and accurate. `agent-reference.md` moves `adx tokens` from the PLANNED block into the live listing and adds `adx help`, leaving `dev`/`create`/`pattern` planned. `human-guide.md` updates the status sentence to `init/build/check/serve/tokens/help` (resolving the prior stale "only build/check/serve/init … the rest are planned" finding) and moves both commands into "Working today," removing them from "Planned." `roadmap.md` drops `tokens` from the unscheduled list and notes it as shipped. `README.md` adds both commands with accurate one-line descriptions. The `name = value` phrasing in README/human-guide matches the actual output. (confirmed)

</details>

<details>
<summary>File map</summary>

- `src/cli.ts` — adds `runTokens()`, `helpText()`, `COMMANDS` source, `help`/`tokens` dispatch; restores `usage()` to the legacy literal; adds `dirname`/`loadTokens` imports.
- `src/tokens/load.ts` — `parseTokens` accumulates `grouped` in the flat-map loop; adds `groups()` to the returned table.
- `src/tokens/types.ts` — new `TokenGroup` interface; `groups()` added to `TokenTable`.
- `src/index.ts` — re-exports `TokenGroup`.
- `test/cli-commands.test.ts` — new suite for tokens/help, arg-scoping regressions, and the `usage()` legacy-literal pin.
- `README.md`, `docs/agent-reference.md`, `docs/human-guide.md`, `docs/roadmap.md` — move tokens/help from planned to shipped.

Full diff: `git diff 8e42642 HEAD`.

</details>
