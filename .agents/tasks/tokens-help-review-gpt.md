# Installed-package token listing and explicit CLI help

The combined feature and remediation commits add `adx tokens` and `adx help` without changing established command contracts. Token discovery is anchored to the installed module, override paths remain working-directory relative, and grouped output now comes from the shared loader. The prior delimiter, double-parse, legacy-usage, and human-guide findings are resolved; recorded build, lint, 228-test, and `/tmp` checks all passed. Watch for: **confirmed, non-blocking** the `helpText()` comment still claims `usage()` consumes `COMMANDS`, and **confirmed, non-blocking** the installed-layout/CWD guarantees are covered by recorded smoke checks rather than durable automated subprocess coverage.

**Verdict**: APPROVED

## High-level view

`adx tokens` selects the bundled `<package>/tokens/design-tokens.json` from `import.meta.url`, not `process.cwd()`, while the explicit `--tokens` branch uses `resolve(args.tokens)` and remains CWD-relative. `loadTokens()` performs the only read and parse; its new `groups()` view preserves source categories and order so the CLI can print aligned `name = value` rows without independently interpreting JSON.

`adx help` has a dedicated stdout/exit-0 branch and renders all six implemented commands with invocations and descriptions. Bare and unknown commands still use the exact legacy short usage on stderr with exit 1, and missing build/check targets inherit that unchanged text. **Confirmed, non-blocking:** the comment above `helpText()` says it is built from the same `COMMANDS` source as `usage()`, but `usage()` is intentionally a separate literal.

The cumulative CLI diff leaves `parseArgs`, `serve`, `runComponent`, `runPage`, `runInit`, `main`, and `isEntryPoint` text unchanged; it only adds imports, help/token support, and two early dispatch branches. Serve-only `--port`/`--host` consumption, symlink-aware entry dispatch, and existing build/check/serve/init behavior therefore retain their previous implementations.

The focused Vitest suite covers bundled and override output, the literal delimiter, grouping, missing/malformed token errors, help/bare/unknown exit streams, serve-option scoping, and the verbatim legacy usage. **Confirmed, non-blocking:** these unit tests import `src/cli.ts` and use an absolute override path, so the installed `dist/cli.js` location and relative override CWD behavior are represented by the commit body's successful `/tmp` smoke evidence, not by a repeatable integration test.

The README, agent reference, human guide, and roadmap edits move tokens/help into the shipped surface while leaving create/dev/pattern work planned. The corrected human-guide status line now agrees with its command block.

<details>
<summary>Issues (2)</summary>

1. **Contradictory help-source comment — confirmed, non-blocking** — `src/cli.ts:197` says `usage()` shares `COMMANDS`, although the remediation intentionally keeps legacy usage separate; remove that stale clause.
2. **Path-origin behavior lacks automated integration coverage — confirmed, non-blocking** — source-level tests use an absolute override and do not execute installed-layout `dist/cli.js` from another CWD; retain the successful smoke evidence and add a focused subprocess/packed-CLI regression when practical.

</details>

<details>
<summary>Details</summary>

## Bundled token lookup and loader-owned category output

The default branch at `src/cli.ts:220-230` resolves upward from `fileURLToPath(import.meta.url)` and then into `tokens/design-tokens.json`. For published `dist/cli.js`, that reaches the package root, and `package.json` includes both `dist` and `tokens` in the publish allowlist. The override calls `resolve(args.tokens)` with no alternate base, retaining Node's CWD-relative semantics.

`runTokens()` calls `loadTokens(path)` once and renders `table.groups()`. The grouped representation at `src/tokens/load.ts:26-40,64-66` is populated during the existing `parseTokens()` pass, keeping category headers, entry order, values, and validation loader-owned. Output includes the literal aligned ` = ` separator; missing or malformed files produce `[ADX] <path> - …` on stderr with exit 1.

## Full help remains separate from legacy error usage

The `help` dispatch at `src/cli.ts:512-516` writes `helpText()` to stdout and returns 0. `usage()` at `src/cli.ts:186-195` exactly matches the pre-feature build/check/init/serve literal, and the cumulative zero-context diff confirms the old-command dispatch below the two new early branches is source-identical.

**Confirmed, non-blocking:** `src/cli.ts:197` says `helpText()` is “Built from the same COMMANDS source as usage().” The remediation deliberately made the opposite choice so old error output cannot expand when help changes, while the earlier comment correctly says only `helpText()` consumes the table. Remove the stale clause so future maintenance does not reintroduce the legacy-usage regression.

## Path-origin guarantees lack a durable integration regression

Tests at `test/cli-commands.test.ts:37-98` exercise bundled values, grouped headings, the `name = value` delimiter, an override, and both loader failure paths. Help coverage pins all command names and stdout/exit 0, bare and unknown stderr/exit 1; lines 146-158 pin serve-only option parsing, and lines 168-184 pin the exact old usage literal.

The commit bodies record `npm run build` exit 0, `npm run lint` exit 0, and 24 test files/228 tests passing after remediation. They also record built-CLI checks from `/tmp` for bundled lookup, help, an override, malformed input, bare/unknown exits, and symlink dispatch. Per the review constraint, those suites were not rerun.

**Confirmed, non-blocking:** the automated suite calls imported source functions and supplies an absolute override path. Add a focused subprocess/integration regression when practical that runs the built or packed CLI from a foreign CWD and passes a relative `--tokens` file, making both path-origin guarantees persistent rather than dependent on commit-body smoke evidence.

## Command documentation stays within shipped scope

The agent reference and human guide place `tokens` and `help` under implemented commands while keeping `dev`, richer `create`, and `pattern` planned. README describes bundled defaults, custom token files, and full help. The roadmap removes token listing from future CLI work, and the human guide now names all six shipped commands in its status sentence.

</details>

<details>
<summary>File map</summary>

- `src/cli.ts` — adds installed-package token listing, explicit help, and isolated dispatch while preserving legacy usage.
- `src/tokens/load.ts`, `src/tokens/types.ts`, `src/index.ts` — expose loader-owned grouped tokens for rendering and public typing.
- `test/cli-commands.test.ts` — covers both commands, errors, parser scoping, and exact legacy usage.
- `README.md`, `docs/agent-reference.md`, `docs/human-guide.md`, `docs/roadmap.md` — mark tokens/help as shipped while retaining planned CLI boundaries.

Full diff: `git diff 8e42642..46656a0`

</details>
