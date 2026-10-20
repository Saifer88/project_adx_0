# Implementation Plan — `adx init` app-shell root + optional `--tailwind`

Worktree: `/Users/pirrima001/coding/personal/project_adx_0/.worktrees/init-app-shell-tailwind`
(branch `feat/init-app-shell-tailwind`). Do NOT push or open a PR.

All paths below are relative to that worktree root unless absolute. Derived from
the design-check at `.agents/tasks/design-check.md` and direct reads of
`src/scaffold.ts`, `src/cli.ts`, `src/page/{load,types,compile}.ts`,
`src/codegen/html.ts`, `docs/adx-grammar.md`, `test/init.test.ts`, and the
`fixtures/compose/landing` + `fixtures/site` fixtures.

## Verification environment (read first)

The worktree has **no `node_modules`**; dependencies live in the parent checkout
`/Users/pirrima001/coding/personal/project_adx_0` (same repo, git worktree).
**Decision: run `npm install` once in the worktree root at the start (step 0)** so
`npx vitest` / `npx tsc` run against the edited files. This install is for local
verification only; it is NOT part of the feature, and `adx init` itself still
never runs npm or touches the network.

- Full suite baseline: **338 tests** (must stay green, plus the new ones added here).
- Build/type-check: `npm run build` (`tsc -p tsconfig.json`).
- Full tests: `npm test` (`vitest run`).
- Scoped tests: `npx vitest run test/init.test.ts`.

## Design decisions (made here, grounded in the code I read)

1. **app-shell is a LAYOUT PARENT component that composes `hello-card` directly
   via `manifest.deps`, NOT via page-level slot projection.** Verified in
   `src/page/load.ts` / `src/page/types.ts` / `src/page/compile.ts`: a page
   `components[]` entry supports only `{ use, data }` — there is **no** slot-fill
   mechanism at the page layer, and all component bodies are concatenated inside
   one page-level `<main>` by `wrapPageDocument`. Slot *projection* exists only
   parent->child inside a component's `structure.adx` (`docs/adx-grammar.md` §11.2,
   confirmed by `fixtures/compose/landing/`). Inventing page-level slot syntax is
   explicitly forbidden. So the page places ONE `app-shell` instance; `app-shell`
   lists `../hello-card` in `deps` and renders `<hello-card/>` inside its own
   content region. Because the page wrapper already emits a `<main>`, app-shell's
   own outer region is a `<div>`/`<section>` wrapper (NOT a second `<main>`) to
   avoid nested-`<main>` landmarks — see step 1 for the exact structure.

2. **Do NOT leave empty page-fillable `<slot>` outlets in app-shell.** Verified in
   `src/codegen/html.ts#emitSlot`: a `<slot>` in a component compiled as a
   top-level page component (no parent) emits a stray `<slot data-adx-slot=…>`
   placeholder into the page HTML (`state.slots` is only set when the component is
   a *child* of a parent, per `compose.ts`). app-shell is placed top-level by the
   page, so any `<slot/>` it declares would leak dead markup and would never be
   filled. Therefore app-shell declares `"slots": []` and renders real semantic
   layout regions (header / content / footer) with the card composed into the
   content region. The task's "named header/main/footer slots" are realized as
   semantic layout regions, not ADX `<slot>` outlets — this keeps the starter
   clean and invents no syntax. A comment in `structure.adx` records this.

3. **One `<h1>`, no skipped heading levels.** app-shell's `<header>` carries the
   single page `<h1>` (the app title). `hello-card`'s title is demoted from `<h1>`
   to `<h2>` (a card heading under the page header — correct, non-skipping
   hierarchy). This CHANGES two existing assertions in `test/init.test.ts`: the
   component test that asserts `<h1`, and the page test that asserts NO `<h2>`.
   Both are updated in step 4.

4. **`--tailwind` is a command-gated boolean flag** (mirror the `pattern`-only
   `--list` gating in `parseArgs`): `const isInit = command === "init"` then
   `else if (isInit && arg === "--tailwind") parsed.tailwind = true;`. Add optional
   `tailwind?: boolean` to `ParsedArgs`. No value token.

5. **Conditional Tailwind files are assembled dynamically inside
   `scaffoldProject` (design-check option (a)).** `SCAFFOLD_FILES` stays the
   unconditional base — the `init.test.ts` "single source of truth" test asserts
   its `.path` list equals the base set. `scaffoldProject(targetDir, opts?: {
   tailwind?: boolean })` starts from the base list and, when `opts.tailwind`,
   (a) swaps the `package.json` thunk for a Tailwind-aware thunk, (b) swaps
   `index.json` for a Tailwind-aware page, and (c) appends `styles/tailwind.css`.
   The full assembled list still goes through `writeFileSet`, so the clobber /
   no-partial-write guard covers every file.

6. **Tailwind wiring uses the page `assets` block directly, not a `site.json`.**
   Verified `fixtures/site/styled.json`: a page may carry `assets.css` itself, so
   the Tailwind `index.json` gets `"assets": { "css": ["/tailwind.css"] }`. This
   avoids a `site.json` and keeps the generated `check` script as plain `adx check
   index.json` (no `--site` plumbing). The Tailwind CSS is produced by a new
   `tailwind` npm script running the Tailwind CLI to `dist/tailwind.css`; the
   generated `build` script runs `tailwind` then `adx build` (`adx build` does not
   clean `dist`, verified in `src/cli.ts#runPage`, so both outputs coexist). The
   page references `/tailwind.css`, which resolves against the emitted document at
   `dist/tailwind.css` — matching where the `tailwind` script emits. `adx init`
   still only writes files + pins versions; it never installs or runs Tailwind.

7. **Tailwind versions are read from the generating CLI's own `package.json`**
   (`devDependencies["tailwindcss"]` and `["@tailwindcss/cli"]`, both `4.3.3` in
   this repo — verified), mirroring how `packageJson()` already reads
   `../package.json` for name/version/engines. Not hardcoded. The Tailwind-aware
   thunk validates those two keys exist and throws the standard `[ADX]` file error
   if either is missing (so a broken install writes nothing).

---

# Implementation Plan

- [ ] 0. Install dependencies in the worktree so verification commands run against
      the edited source.
      Files: none (creates `node_modules/`, `package-lock.json` — both gitignored).
      Verify: `npm install` completes; `npx vitest run test/init.test.ts` runs and
      the current suite passes (establishes the green baseline before edits).

- [ ] 1. Add the new four-file `app-shell/` component as embedded templates in
      `src/scaffold.ts` and route them through `SCAFFOLD_FILES` (base, always-on).
      - `app-shell/manifest.json`: `name` "AppShell", version 1.0.0, props all
        DEFAULTED (e.g. `appName` default "My ADX App", `tagline` default a short
        string, `year` default a literal string). `emits: []`, `slots: []`,
        `deps: ["../hello-card"]`, `seo: { "title": "My ADX App", "schema":
        "WebPage" }`. NO `required` props (bare `adx check` runs with no `--data`).
      - `app-shell/structure.adx`: semantic layout WITHOUT a second `<main>`
        (decision 1 — the page wrapper already emits `<main>`). A root wrapper
        `<div .app-shell>` containing: `<header .app-header>` with the single
        `<h1 .app-title>{{appName}}</h1>` and `<p .app-tagline>{{tagline}}</p>`;
        a content region `<section .app-content>` holding the composed child
        `<hello-card />` (self-closing; props default, so no bindings needed);
        `<footer .app-footer>` with `<p>` + `{{year}}`. Add a comment explaining
        these are semantic layout regions (not ADX `<slot>` outlets) and why
        (decision 2). Use `.className` dot-shorthand only.
      - `app-shell/behavior.adx.js`: pure `setup(props)` returning
        `{ appName, tagline, year }` (mirror `fixtures/compose/landing/behavior.adx.js`).
        No emits.
      - `app-shell/style.adx.css`: `@use tokens;` then token-only rules
        (`space-*`, `surface-*`, `text-*`, `radius-*`, `shadow-*`, typography
        tokens). No hardcoded hex. Honor the UX baseline: token spacing scale,
        AA contrast (reuse the same token palette hello-card uses), a readable
        centered `max-width` measure on `.app-content`, reduced-motion safe
        (no motion needed).
      - Add these four entries to `SCAFFOLD_FILES` as inline string constants,
        placed before the `hello-card/` entries (stable, cosmetic order).
      - Escaping: follow existing template rules — escape literal backticks and any
        literal `${`; `{{var}}` needs no escaping; keep a trailing newline per
        constant.
      Files: `src/scaffold.ts`
      Verify: `npm run build` confirms the new template literals type-check.
      `npx vitest run test/init.test.ts` — the `SCAFFOLD_FILES`-list test will FAIL
      here because the expected array changed; that is expected and corrected in
      step 4.

- [ ] 2. Demote `hello-card`'s title from `<h1>` to `<h2>` and update its
      embedded template comment to reflect that it now renders inside `app-shell`'s
      content region (the page `<h1>` lives in the shell header).
      - In the `STRUCTURE` constant, change `<h1 .title>{{title}}</h1>` to
        `<h2 .title>{{title}}</h2>`.
      - Update the `STRUCTURE` doc comment (it currently says the card title is the
        page's single `<h1>`): say the shell header owns the `<h1>` and the card
        title is an `<h2>` within the content region, non-skipping.
      - `style.adx.css` `.title` rule is unchanged (it still styles the heading).
      Files: `src/scaffold.ts`
      Verify: `npm run build` passes. Test assertions updated in step 4.

- [ ] 3. Update the base (no-flag) `index.json` template so the page composes
      `app-shell` as its single root component instead of `hello-card` directly.
      - Change the `PAGE` constant `components` to a single entry
        `{ "use": "./app-shell", "data": { "appName": "...", "tagline": "..." } }`.
        Every app-shell prop defaults, so `data` is optional; include a small
        friendly `data` block to mirror today's explicit greeting intent. Keep the
        `page`/`title`/`description`/`lang`/`schema` fields as-is.
      - Keep the greeting string "Welcome to your new ADX project." reachable (it
        comes from `hello-card`'s defaulted `message`, composed inside app-shell),
        so the existing page test's `toContain(...)` still holds.
      Files: `src/scaffold.ts`
      Verify: `npm run build` passes. Page-compile assertions verified in step 4.

- [ ] 4. Update `test/init.test.ts` to match the new base scaffold set and heading
      structure. Change ONLY the assertions that must change; keep every other
      assertion intact.
      - Extend the `expected` array in the "creates the component, tokens, page…"
        test (which also drives the `SCAFFOLD_FILES.map((f)=>f.path)` assertion) to
        include the four `app-shell/*` files in the order chosen in step 1.
      - In the component-compile test ("scaffolds a component that compiles…"),
        change `expect(result.html).toContain("<h1")` to `toContain("<h2")`; keep
        the `min-height`, no-`{{`, no-`tokens.` assertions.
      - In the page-compile test ("scaffolds a page that compiles…"), keep
        `h1Count === 1`; REPLACE `expect(result.html).not.toMatch(/<h2[\s>]/)` with
        a non-skip assertion: assert exactly one `<h1>`, at least one `<h2>`
        (the card title), and `not.toMatch(/<h3[\s>]/)` (no level skipped for the
        starter).
      - Add a NEW unit test: `scaffoldProject(dir)` then
        `compileComponent(join(dir,'app-shell'), { tokensPath })` with no data —
        assert the html contains the app name, contains the composed card text
        ("Welcome to your new ADX project."), no `{{`, and css has no `tokens.`.
      Files: `test/init.test.ts`
      Verify: `npx vitest run test/init.test.ts` — all scaffold/init tests pass
      (base app-shell starter compiles clean; heading hierarchy correct).

- [ ] 5. Add the `--tailwind` flag to the CLI parser and init handler in
      `src/cli.ts`, plus help/usage text.
      - Add `tailwind?: boolean` to the `ParsedArgs` interface (optional, like
        `list?`), so the literal `ParsedArgs` objects in tests stay type-complete.
      - In `parseArgs`, add `const isInit = command === "init";` and a branch
        `else if (isInit && arg === "--tailwind") { parsed.tailwind = true; }`
        alongside the existing `isPattern`/`isServe` gated-flag branches (before the
        positional fallbacks), so for every non-init command `--tailwind` stays an
        ignored unknown `--` token.
      - In `runInit`, pass the flag through: `scaffoldProject(target, { tailwind:
        args.tailwind })`. When `args.tailwind`, append a Tailwind "Next steps" line
        (e.g. `npm run tailwind` note); keep the default-case next-step lines
        byte-stable.
      - Update the `adx init` doc comment block at the top of `cli.ts` to mention
        the app-shell root and the `--tailwind` flag.
      - Update the `COMMANDS` table init entry invocation to
        `adx init [name] [--tailwind]` and its description to mention the optional
        Tailwind wiring. Update `usage()`'s `adx init [name]` line to
        `adx init [name] [--tailwind]`. NOTE: `usage()`/`helpText()` output is
        asserted by CLI tests — update those expected literals in lockstep in
        step 7.
      Files: `src/cli.ts`
      Verify: `npm run build` passes (type-check); `npx vitest run test/init.test.ts`
      still green (default path unchanged).

- [ ] 6. Make `scaffoldProject` accept `{ tailwind?: boolean }` and emit the
      conditional Tailwind files + Tailwind-aware `package.json`/`index.json`.
      - Add a Tailwind-aware package.json thunk (single thunk branching on a
        captured flag, mirroring the existing `packageJson()` pattern): reads the
        SAME `../package.json`, additionally validates `devDependencies["tailwindcss"]`
        and `["@tailwindcss/cli"]` exist (throw the standard `[ADX]` file error if
        either is missing), adds them to the generated app `devDependencies`, and
        sets scripts to `{ build: "npm run tailwind && adx build index.json",
        check: "adx check index.json", serve: "adx serve dist", tailwind:
        "@tailwindcss/cli -i styles/tailwind.css -o dist/tailwind.css --minify" }`.
      - Add a Tailwind-aware `index.json` string (the base page plus
        `"assets": { "css": ["/tailwind.css"] }`).
      - Add a `styles/tailwind.css` input constant: `@import "tailwindcss"
        source("../");` with a trailing newline (comment that the compiled output
        goes to `dist/tailwind.css` via `npm run tailwind`, never by ADX).
      - Change the signature to `scaffoldProject(targetDir: string, opts: {
        tailwind?: boolean } = {})`. Build the file list: start from
        `SCAFFOLD_FILES`; when `opts.tailwind`, map the `package.json` entry to the
        Tailwind thunk, map the `index.json` entry to the Tailwind page, and append
        `{ path: "styles/tailwind.css", contents: TAILWIND_INPUT }`. Resolve every
        thunk to a string BEFORE calling `writeFileSet` (keep the current guard
        order so a throwing thunk writes nothing).
      - Keep `SCAFFOLD_FILES` as the unmodified base constant (the list test in
        step 4 asserts the base set; Tailwind files are layered on, not added to
        the constant).
      Files: `src/scaffold.ts`
      Verify: `npm run build` passes; `npx vitest run test/init.test.ts` green.

- [ ] 7. Add tests for the `--tailwind` path and the CLI flag, matching the
      existing patterns in `test/init.test.ts`, and update the CLI usage/help
      assertions wherever they live.
      - New `scaffoldProject` unit tests (temp dir via `mkdtempSync`):
        - `scaffoldProject(dir, { tailwind: true })` writes `styles/tailwind.css`
          whose input contains `@import "tailwindcss"`, and the default (no-flag)
          run does NOT write it.
        - The Tailwind `package.json` pins `tailwindcss` and `@tailwindcss/cli` to
          the framework's own devDependency versions (read the framework
          `package.json` in the test, like the existing pin test) and has a
          `tailwind` script plus a `build` script that runs it before `adx build`.
        - The Tailwind `index.json` has `assets.css` containing `/tailwind.css` and
          still compiles via `compilePage` with no data (greeting present, no `{{`);
          assets are referenced, not required to exist on disk.
        - Clobber safety for the Tailwind set: pre-create `styles/tailwind.css`
          (and separately `index.json`), expect the `[ADX] … already exists` throw
          and that no OTHER file (e.g. `app-shell/manifest.json`) was written —
          analogous to the existing `it.each([...])` guard test.
      - CLI dispatch: add a `run({ command: "init", …, tailwind: true })` test
        asserting the Tailwind files land and the exit code is 0; and confirm a
        default `init` run (no `tailwind`) still produces exactly the base set.
      - Locate the test(s) asserting `usage()`/`helpText()`/`COMMANDS` output —
        grep `test/` for `adx init [name]` and `usage(` (e.g. a cli-commands /
        cli-help test file) — and update those expected strings to
        `adx init [name] [--tailwind]` in lockstep with step 5.
      Files: `test/init.test.ts`, and the CLI-usage/help test file found by grep.
      Verify: `npx vitest run test/init.test.ts` and the located CLI test file —
      all pass.

- [ ] 8. Update the framework's own docs to describe the app-shell root starter
      and the `--tailwind` flag. Keep each doc's voice (compact/reference for
      agent-facing, warmer for human-facing), keep tables/badges/anchors intact,
      and keep the cold-start guard wording consistent across all three surfaces.
      - `README.md`: Quick Start (~line 36-60) notes init now scaffolds an
        `app-shell/` root composing `hello-card`; the Project Structure tree
        (~line 125) adds `app-shell/`; the CLI table row for `adx init` (~line 147)
        notes `[--tailwind]`; document `adx init [name] --tailwind` in the Tailwind
        section (~line 168-184), pointing at the existing recipe anchor. Leave the
        "do NOT `npm install project-adx-0`" cold-start guard (~line 40-48)
        unchanged.
      - `docs/agent-reference.md`: "Install and First Page" (~line 19-45) — update
        the `init creates …` list (~line 45) to include `app-shell/` and note
        `--tailwind`; "Current Capabilities" fast-path line (~line 90); CLI
        synopsis line (~line 361) to `adx init [name] [--tailwind]`. Keep
        token-efficient; keep the cold-start wording (~line 24) intact.
      - `docs/human-guide.md`: Quick Start / Project Structure (~line 25-41) and
        the CLI synopsis line (~line 608) updated the same way; note `--tailwind`
        near the existing Tailwind section (~line 851). Keep the cold-start guard.
      - `docs/adx-grammar.md`: VERIFY no change needed — app-shell uses existing
        `deps`/composition syntax and no new slot/manifest syntax. Confirm by
        re-reading §6/§11; edit only if something actually changed (it should not).
      Files: `README.md`, `docs/agent-reference.md`, `docs/human-guide.md`
      (and `docs/adx-grammar.md` only if verification finds a real change).
      Verify: `npx vitest run test/init.test.ts` — the "compiles the agent
      reference's four-file example verbatim" test still passes (that example is
      unchanged), and the README-content assertions in init.test.ts (`npm install`,
      `package-lock.json`, `[AGENTS.md](./AGENTS.md)`) still hold.

- [ ] 9. Update the generated `README.md` and `AGENTS.md` template strings in
      `src/scaffold.ts` so the scaffolded project's own docs describe the app-shell
      root and the Tailwind install/build step, while keeping the default (no-flag)
      docs correct and every existing init.test.ts content assertion satisfied.
      - Generated `README` constant: mention the `app-shell/` root composing
        `hello-card`; KEEP the exact phrases the tests assert (`npm install`,
        `npm run check`, `npm run build`, `npm run serve`, `package-lock.json`,
        `[AGENTS.md](./AGENTS.md)`). Add a short "If you scaffolded with
        `--tailwind`" note documenting `npm run tailwind` and that `npm run build`
        compiles Tailwind first. Keep this to ONE `README` constant (the per-flag
        difference is carried by the devDeps/scripts, not the prose) to preserve
        the single-thunk shape.
      - Generated `AGENTS` constant: KEEP every asserted phrase intact (Caveman
        defaults, app-scope, local-CLI setup, the "do not install the npm package
        named `adx`" line, the `node_modules/project-adx-0/docs/agent-reference.md`
        path). Add at most a brief line noting the app-shell root is the layout
        entry; do not break escaping or any `toContain` assertion.
      - Re-verify template escaping (backticks, `${`) and trailing newlines.
      Files: `src/scaffold.ts`
      Verify: `npx vitest run test/init.test.ts` — the AGENTS/README content tests
      all pass.

- [ ] 10. Full green gate.
      Files: none.
      Verify: `npm run build` (tsc clean) AND `npm test` (full `vitest run`) — all
      tests pass: the 338-test baseline plus the new scaffold/CLI tests from steps
      4 and 7, with zero regressions. Confirm `adx init` still writes files only:
      `scaffoldProject`/`runInit` contain no spawn/exec/fetch (verified — they do
      not), and `--tailwind` only pins versions + writes config files.

## Notes / assumptions

- Keeping single generated `README`/`index.json`/`package.json` *base* constants
  plus Tailwind-aware overrides assembled in `scaffoldProject` preserves the
  "`SCAFFOLD_FILES` is the base set" invariant the existing list test depends on.
- `adx build` does not clean `dist/` (verified in `src/cli.ts#runPage`), so
  `npm run tailwind` (writes `dist/tailwind.css`) and `adx build index.json`
  (writes `dist/index.html` etc.) coexist; the generated `build` runs tailwind
  first to match the documented recipe order.
- If the CLI usage/help assertions live in more than one test file, update each
  occurrence found by the step-7 grep.
- No compiler/codegen changes — only `src/scaffold.ts`, `src/cli.ts`, their tests,
  and docs are touched. app-shell uses only existing `deps`/composition syntax.

## Workflow decomposition decision

This task does NOT decompose into separable FEATs. It is one coherent
scaffolder + CLI-flag + docs change confined to two source files
(`src/scaffold.ts`, `src/cli.ts`) plus their tests and the docs, with tight
ordering coupling (the scaffold template change and the test-assertion update must
land together to stay green). The brief itself notes it "most likely does NOT need
per-FEAT decomposition." The remaining implement-and-review loop will execute this
single plan. The workflow tail is therefore left unchanged.
