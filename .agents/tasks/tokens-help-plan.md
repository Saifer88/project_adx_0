# Implementation Plan — `adx tokens` + `adx help`

Add two self-contained subcommands to the ADX CLI, their tests, and sync the docs.
Repo IS the `project-adx-0` npm package (bin `adx` → `dist/cli.js`). Work on `main`,
no worktree. ESM TypeScript, strict TS + typescript-eslint (no `any`), Vitest.

## Design decisions (grounded in the code I read)

- **Grouping source for `adx tokens`.** `TokenTable` (src/tokens/types.ts) exposes only
  `resolve`/`has`/`availableSpacing`/`names()` — it carries NO group/category metadata.
  To print a listing grouped by category (spacing/colors/radius/shadow/typography/
  breakpoints, in file order) I will read the raw `design-tokens.json` text, `JSON.parse`
  it, and iterate its top-level object groups (same shape `parseTokens` walks: skip scalar
  meta like `$schema-note`), emitting each group's `name = value` pairs. I will STILL route
  the read+parse through the existing loader semantics for the error path: call
  `loadTokens(path)` (src/tokens/load.ts) first so a missing/malformed file throws, is
  caught, and produces the standard `[ADX] <path> - ...` stderr + exit 1 like other commands.
  Rationale: reusing group structure from the JSON keeps categories and order intact without
  adding a new method to the `TokenTable` contract; the loader still owns validation so error
  behavior stays consistent. (One decision, chosen over adding a `groups()` method to
  `TokenTable`, which would touch the compiler's shared contract for a CLI-only need.)

- **Default token path resolves to the installed package, not CWD.** Mirror the pattern
  already used in test/init.test.ts and test/helpers.ts: `fileURLToPath(import.meta.url)` →
  `dist/cli.js` at runtime → go up one dir to the package root → `tokens/design-tokens.json`
  (i.e. `resolve(dirname(fileURLToPath(import.meta.url)), "..", "tokens", "design-tokens.json")`).
  `tokens/` is already in package.json `files`. When `--tokens <path>` is passed, resolve it
  against CWD exactly as build/check do (parseArgs already captures `--tokens`; reuse it — do
  NOT add a new flag).

- **`adx` with no command.** Keep today's behavior: short `usage()` to STDERR, exit 1
  (RECOMMENDED). `adx help` is an explicit request → full help to STDOUT, exit 0. Unknown
  command stays error → stderr + exit 1 (unchanged).

- **No `--help`/`-h` alias.** Adding `--help` risks leaking a flag into build/check positional
  parsing and needs extra guarding for zero benefit here. Skip it; add only the `help`
  subcommand. (Decision: cheaper and keeps build/check arg parsing byte-for-byte.)

- **Single source for help text.** Introduce `helpText()` returning the full multi-line help
  (all six implemented commands + flags + one-line descriptions). Keep the short `usage()` for
  error cases, but derive it so command lists don't drift — `usage()` returns the compact
  subset already shown on errors; `helpText()` is the superset printed by `adx help`. Both live
  next to each other and are exported-adjacent so a reviewer sees them together.

- **No decomposition / no workflow restructure.** All four tasks are one cohesive feature pair
  that must land together to keep build+lint+tests green; splitting CLI from its tests or docs
  would create non-green intermediate states. The existing implement-and-review loop runs this
  plan; the gate file `.agents/tasks/tokens-help-review.json` with `verdict: APPROVED` stops it.

## Steps

- [ ] 1. Add the `tokens` and `help` subcommands to the CLI.
      In src/cli.ts: (a) extend the top-of-file doc comment with `adx tokens [--tokens <path>]`
      and `adx help` blocks in the existing voice; (b) add `helpText()` (full help: init, build,
      check, serve, tokens, help — each with flags + a one-line description, `[ADX]`/concise
      voice) and keep `usage()` as the short error form reusing the same command names so they
      can't drift; (c) add `runTokens(args): number` — default path via `import.meta.url` up from
      `dist/cli.js` to `tokens/design-tokens.json`, or `resolve(cwd, args.tokens)` when `--tokens`
      is set; call `loadTokens(path)` for validation (catch → `[ADX] <path> - ...` to stderr,
      return 1), then read+`JSON.parse` the raw file and print each category's `name` → `value`
      aligned/grouped to stdout, return 0; (d) in `run()`, add `tokens` and `help` to the
      dispatch: `help` prints `helpText()` to stdout and returns 0, `tokens` calls `runTokens`.
      Do NOT touch parseArgs serve-flag gating, build/check/init bodies, `serve`, or
      `isEntryPoint()`. Export nothing new is required, but keep `run`/`parseArgs`/`usage` exports.
      Files: src/cli.ts
      Verify: `npm run build` compiles clean; `node dist/cli.js tokens` prints grouped tokens incl.
      `space-4`/`16px`, `primary`/`#1d4ed8`, `radius-md`/`8px` and exits 0; `node dist/cli.js help`
      lists init/build/check/serve/tokens/help and exits 0; `node dist/cli.js` still prints usage to
      stderr and exits 1.

- [ ] 2. Add Vitest coverage for both commands.
      Create test/cli-commands.test.ts following test/init.test.ts (spy `process.stdout`/`stderr`
      with `vi.spyOn`, call `run({...full ParsedArgs...})`) and test/serve.test.ts (temp files via
      `mkdtempSync`, cleaned in `afterEach`). Cover: `run({command:"tokens", tokens:undefined,...})`
      → exit 0, stdout contains a spacing token (e.g. `space-4` + `16px`), a color token
      (`primary` + `#1d4ed8`), a radius token (`radius-md` + `8px`); `--tokens` override pointing a
      temp JSON (small `{"spacing":{"space-x":"1px"}}`) → exit 0, output reflects `space-x`/`1px`;
      missing path and malformed JSON → exit 1 with a `/^\[ADX\]/` stderr match; `run({command:"help"})`
      → exit 0, stdout contains each of init, build, check, serve, tokens, help; a regression check
      that `parseArgs(["build","--host","fixtures/user-card"]).dir === "fixtures/user-card"` and
      `.host === undefined` (do not weaken the existing serve.test.ts assertion — add an equivalent
      here or leave serve.test.ts's as the canonical one and reference it). Clean up temp files; no
      long-running processes.
      Files: test/cli-commands.test.ts
      Verify: `npm test` — all suites green, new tests pass, existing 209 tests unchanged.

- [ ] 3. Sync docs: move `tokens`/`help` from PLANNED to IMPLEMENTED, leave create/dev/pattern planned.
      - docs/agent-reference.md (CLI block ~lines 427-441): add `adx tokens [--tokens <path>]`
        (list design tokens grouped by category) and `adx help` (show full command help) under
        `# IMPLEMENTED (M1 + M2)`; remove the `adx tokens` line from `# PLANNED`, keep `adx dev` and
        `adx create / pattern` planned. Compact style.
      - docs/human-guide.md (CLI block ~lines 611-618): move `adx tokens` and `adx help` into the
        "Working today" list with short friendly descriptions; keep `adx create`/`adx dev`/
        `adx pattern` under `# Planned`.
      - docs/roadmap.md (~lines 128-129): adjust the later-milestones line so `adx tokens` (list
        tokens) and `adx help` read as shipped while `create`/`pattern`/`dev` stay planned (e.g.
        "richer `adx create`/`pattern` CLI" and move tokens/help to a shipped note).
      - README.md (CLI section ~lines 73-88): add `adx tokens [--tokens <path>]` and `adx help`
        lines with one-line comments, honest 0.1.0-alpha voice.
      Do NOT touch references to still-planned dev/create/pattern, the `adx` command name,
      `@adx/patterns`, `data-adx-*`, `.adx` extensions, or token names/values themselves.
      Note: .kiro/steering/tech.md's "Planned CLI surface" also lists `adx tokens` — leave steering
      files alone (they describe original design intent and are out of the doc-sync scope above);
      if the reviewer wants it updated, that is a separate surgical edit.
      Files: docs/agent-reference.md, docs/human-guide.md, docs/roadmap.md, README.md
      Verify: `rg "adx tokens" docs README.md` shows tokens under implemented/working sections only;
      no PLANNED block still lists `adx tokens`/`adx help`.

- [ ] 4. Final gate: build, lint, tests all green.
      Run the full suite after code + tests + docs land. Fix any TS/eslint findings (no `any`,
      typed style). Confirm no behavior change to build/check/serve/init.
      Files: (none — verification only)
      Verify: `npm run build` && `npm run lint` && `npm test` all exit 0; manual spot-check
      `node dist/cli.js tokens`, `node dist/cli.js tokens --tokens tokens/design-tokens.json`,
      `node dist/cli.js help`, and `node dist/cli.js` (usage/exit 1) behave as specified.

## Notes / assumptions

- The malformed-token-file test relies on `loadTokens` throwing on bad JSON (it does —
  `parseTokens` calls `JSON.parse` with no catch). The CLI wraps that in a try/catch to produce
  `[ADX] <path> - <msg>` on stderr and return 1, consistent with `loadData` in cli.ts.
- Alignment in the tokens listing is cosmetic; tests assert on substrings (name + value), not on
  exact spacing, so column padding can be tuned freely.
