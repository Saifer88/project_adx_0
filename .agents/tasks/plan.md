# Implementation Plan — `adx create <path>/<component-name>` (nested component paths)

## Goal

Make `adx create` accept a POSIX forward-slash path where everything LEFT of the
final `/` segment is a nested directory prefix (created mkdir -p style) and the
LAST segment is the component name. The flat single-segment case must stay
byte-for-byte identical. User-approved rules: (a) arbitrary depth, every segment
an independent valid slug; (b) PascalCase manifest `name` derived from the LAST
segment only.

## Design decisions (made here, grounded in the code I read)

- **Where parsing/validation lives: `src/create.ts`, not `src/cli.ts`.** The CLI
  handler `runCreate` already passes `args.dir` straight into
  `scaffoldComponent(name)` and relies on the thrown `[ADX]` error -> stderr +
  exit 1 (see `run()`'s try/catch around init/create/pattern). Keeping the logic
  in `create.ts` means no parser change, the CLI error path is untouched, and
  the existing unit-level tests (`validateComponentName`, `templatedFiles`,
  `scaffoldComponent`) remain the natural test surface. Chosen over threading a
  parsed structure through `parseArgs`/`ParsedArgs`, a larger, riskier change
  for no benefit.

- **Reuse the existing per-segment slug via `NAME_RE`.** `validateComponentName`
  already enforces `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, which independently rejects
  empty, `..`, `/`, `\`, uppercase, and leading/trailing hyphens. Validating
  EACH split segment with that same rule gives rule (a) for free and keeps the
  traversal guarantee: a strict slug per segment can only descend. Chosen over a
  new regex (would duplicate/diverge the slug definition).

- **Error message shape.** Keep the canonical `[ADX] <input> - …` prefix the CLI
  and tests already match (`/^\[ADX\]/m`, `/^\[ADX\] .* invalid/`). Echo the
  whole user input (e.g. `landing//footer`) as the subject, mirroring how
  `validateComponentName` echoes its `name`. The flat-case message stays exactly
  `[ADX] <name> - invalid component name (lowercase, hyphenated; no path
  separators)` so the existing `validateComponentName` rejection tests pass
  unchanged.

- **POSIX forward-slash is the only accepted separator.** Split strictly on `/`.
  A backslash `\` never splits, so `a\b` is one segment that fails `NAME_RE`
  (contains `\`) and is rejected. An absolute path (leading `/`) produces an
  empty first segment -> rejected. Matches the task's required rejections without
  per-OS special-casing.

- **POSIX-relative returned paths (forward slashes).** `templatedFiles` already
  returns forward-slash relative paths like `widget-card/manifest.json`, and
  `SCAFFOLD_FILES`/`writeFileSet` use the same convention; `writeFileSet` calls
  `resolve(base, file.path)`, which accepts `/` on every platform. So the new
  prefixed paths are built with literal `/`. Verified: `scaffoldPattern` already
  passes a nested `dir2` (e.g. `ui/contact-form`) through `resolve()`
  successfully, confirming nested relative paths work with the shared writer.

- **PascalCase from last segment only** (rule b): `pascalCase(lastSegment)`, so
  `landing/footer` -> `Footer` and `contact-us/sidebar` -> `Sidebar`. The
  directory prefix never influences the manifest `name`.

- **Conflict guard scope unchanged.** The overwrite-guarded set stays the four
  component files (under `<prefix>/<last>/`). `writeFileSet` mkdir -p's all
  parents, so creating into an existing prefix dir that lacks the four files
  succeeds; if the four files exist it still refuses and writes nothing.

- **`usage()` is frozen.** A regression test pins the short `usage()` literal
  byte-for-byte. Document the new form only via the top-of-file doc comment, the
  `COMMANDS` table entry, and `helpText()` (built from `COMMANDS`) — exactly as
  `--tailwind` was handled. Do NOT touch `usage()`.

## Plan

- [ ] 1. Add a path parser/validator in `src/create.ts` that splits the create
      argument on `/`, validates each segment, and returns the directory prefix
      segments plus the last (component) segment.
      Add a new exported function, e.g. `parseComponentPath(input: string):
      { dirs: string[]; name: string }`. Behavior: reject the whole `input` with
      `[ADX] <input> - invalid component path (lowercase, hyphenated segments; no
      empty, '..', backslash, or absolute paths)` if `input` is empty, starts or
      ends with `/`, or contains `//` (any empty segment); otherwise split on `/`
      and run each segment through `NAME_RE` (reuse the existing constant /
      `validateComponentName` semantics) — any failing segment rejects with the
      same `[ADX] <input> - …` error. `..`, `\`, uppercase, and leading/trailing
      hyphens are all caught by `NAME_RE` per segment. The LAST element is
      `name`; the preceding elements are `dirs`. Keep `validateComponentName`
      exported and unchanged (the flat single-segment path still flows through it
      so its message/tests are byte-for-byte preserved — see item 2).
      Files: src/create.ts
      Verify: `npx vitest run test/create.test.ts` — existing tests still pass
      (no behavior change yet for the flat case).

- [ ] 2. Make `templatedFiles` build the four paths under the full
      `<prefix>/<lastSegment>/` and derive the PascalCase manifest name from the
      LAST segment only, while keeping the flat single-segment output identical.
      In `src/create.ts`, change `templatedFiles(name)` to parse `name` via
      `parseComponentPath`, compute the pascal name from the last segment, build
      `prefix = result.dirs.join("/")`, and set each file path to
      `<prefix>/<lastSegment>/manifest.json` (etc.) when `prefix` is non-empty,
      or `<lastSegment>/manifest.json` when `dirs` is empty. For a single-segment
      argument `dirs` is empty, so the output is byte-for-byte the current
      `widget-card/manifest.json` etc. with manifest name `WidgetCard` — nothing
      changes for the flat case. The file CONTENTS (manifest/structure/behavior/
      style strings) are unchanged except the manifest `name` value, which
      already comes from the pascal name.
      Files: src/create.ts
      Verify: `npx vitest run test/create.test.ts` — the existing
      `templatedFiles` / flat `scaffoldComponent` tests pass unchanged.

- [ ] 3. Route `scaffoldComponent` through the new parser so nested paths
      validate and scaffold end to end via the shared conflict-safe writer.
      In `src/create.ts`, change the body of `scaffoldComponent(name, targetDir =
      ".")` so it first validates via `parseComponentPath(name)` (throws the
      `[ADX]` error on any bad segment / empty / `..` / backslash / absolute),
      then `return writeFileSet(resolve(targetDir), templatedFiles(name))`. The
      conflict guard, mkdir -p of intermediate dirs, and no-partial-write
      guarantee all come from `writeFileSet` unchanged. Confirm the flat case
      still rejects invalid names with the existing message (e.g.
      `scaffoldComponent("WidgetCard")` still throws). No change to `src/cli.ts`
      runtime behavior: `runCreate` still passes `args.dir` and relies on the
      thrown `[ADX]` error.
      Files: src/create.ts
      Verify: `npx vitest run test/create.test.ts` — all existing tests pass.

- [ ] 4. Add tests covering the nested-path behavior and all required rejections,
      following the existing `test/create.test.ts` patterns.
      In `test/create.test.ts` add cases:
      - `scaffoldComponent("landing/footer", dir)` returns the four paths
        `landing/footer/{manifest.json,structure.adx,behavior.adx.js,style.adx.css}`,
        the files exist on disk, and the manifest contains `"name": "Footer"`
        (rule b). Add an arbitrary-depth case: `a/b/c/footer` ->
        `a/b/c/footer/...` with manifest name `Footer`.
      - `contact-us/sidebar` -> manifest name `Sidebar` (hyphenated prefix
        segment is a valid slug; last segment drives the name).
      - Compiled-clean assertion: scaffold `landing/footer`, then
        `compileComponent(join(dir, "landing/footer"), { tokensPath })` and
        assert no `{{`, no `tokens.`, and `Footer` present (mirrors the existing
        "compiles clean" test).
      - Conflict into an existing prefix: pre-create `landing/` (empty) ->
        `scaffoldComponent("landing/footer", dir)` SUCCEEDS; re-running it then
        throws `/already exists; refusing to overwrite$/` and writes nothing new.
      - Rejections (each throws `/^\[ADX\]/` and writes nothing): `landing//footer`,
        `/landing`, `landing/`, `landing/Footer` (uppercase segment), `a/../b`,
        `a\b` (backslash), and `landing/foo--bar` (bad slug segment). Assert the
        target dir is empty/untouched after a rejection.
      - Keep/confirm the existing flat `validateComponentName` rejection test
        (`WidgetCard`, `../x`, `a/b`, `""`, `-lead`, `trail-`, `a--b`) still
        passes — `a/b` must still be rejected by `validateComponentName` itself
        (the flat validator is unchanged; only `scaffoldComponent` /
        `templatedFiles` gained path parsing).
      Also add one CLI-dispatch case in the existing `adx create CLI dispatch`
      block: `run(argsFor({ command: "create", dir: "landing/footer" }))` returns
      0, writes `landing/footer/manifest.json` under cwd, and prints the nested
      paths; and a rejection case `dir: "landing//footer"` returns 1 with
      `/^\[ADX\]/m` on stderr.
      Files: test/create.test.ts
      Verify: `npx vitest run test/create.test.ts test/cli-commands.test.ts` —
      all tests pass, including the new nested cases and the unchanged `usage()`
      regression tests in cli-commands.

- [ ] 5. Update the `adx create` doc comment block at the TOP of `src/cli.ts` and
      the `COMMANDS` table entry to document the `<path>/<component-name>` form.
      Do NOT touch `usage()`.
      In `src/cli.ts`: (a) in the top-of-file doc comment, change the `adx create
      <component-name>` block header to `adx create <path>/<component-name>` and
      add one or two sentences: a leading path (slash-separated slugs) is created
      as nested folders (mkdir -p), the LAST segment is the component name and
      derives the PascalCase manifest name; a bare name still scaffolds flat in
      CWD; each segment must be a valid slug or it's rejected `[ADX] <input> - …`
      exit 1. (b) In the `COMMANDS` array, change the `create` entry `invocation`
      to `"adx create <path>/<component-name>"` and update `description` to
      mention the optional nested folder prefix (e.g. "Scaffold one new component
      (optionally under a nested folder path) into the current project."). Leave
      the `runCreate` doc comment accurate (it already says it reuses `dir` and
      relies on the thrown `[ADX]` error — still true).
      Files: src/cli.ts
      Verify: `npx vitest run test/cli-commands.test.ts` — the `adx help` test
      (asserts `adx create` appears) and the `usage()` byte-for-byte regression
      tests all pass (usage() unchanged).

- [ ] 6. Update the human and agent docs to document the nested-path form with
      concrete examples.
      Edits:
      - `README.md` (CLI table, ~line 163): change the `create` row so the
        command reads `adx create <path>/<component-name>` and the purpose notes
        it scaffolds one four-file component into the current project, optionally
        under a nested folder path (e.g. `adx create landing/footer`), the last
        path segment being the component name; still never overwrites.
      - `docs/agent-reference.md` (IMPLEMENTED list, ~line 369): change the
        `adx create <component-name>` line to `adx create <path>/<component-name>`
        and append a short, reference-style note after the command block:
        leading `/`-separated segments become nested folders (mkdir -p); each
        segment is an independent slug; the last segment is the component name
        AND the source of the PascalCase manifest `name` (so `landing/footer` ->
        dir `landing/footer/`, name `Footer`). Keep the file's terse voice.
      - `docs/human-guide.md` (CLI list ~line 609 and the "Add a component"
        section ~line 642): update the command-listing line to `adx create
        <path>/<component-name>`, and in the prose add a short paragraph + example
        block showing `adx create landing/footer` (-> `landing/footer/…`, manifest
        name `Footer`), `adx create contact-us/main`, and `adx create button`
        (still flat in the current dir). Note rule (b): the PascalCase name comes
        from the last segment only, so the same component name is reusable across
        folders; and that invalid/empty segments, `..`, backslashes, and absolute
        paths are rejected with an `[ADX] … ` error, exit 1, writing nothing.
      - `docs/adx-grammar.md`: edit ONLY if it documents the create ARG grammar.
        A grep found no `adx create` / `create ` references, so leave it
        unchanged; state explicitly in the implementation that it was checked and
        intentionally not edited.
      Files: README.md, docs/agent-reference.md, docs/human-guide.md
      Verify: manual read-back of each edited section for accuracy; no build step
      for docs (the repo has no docs linter; `npm run lint` covers TS only).

- [ ] 7. Reconcile the flat-layout steering so it is not contradicted by nested
      component paths.
      `.kiro/steering/structure.md` says "Every component is a flat directory
      holding exactly four files. No nesting." That refers to a component's OWN
      contents (four files, no sub-folders inside a component), which remains
      true. Nested create paths add PARENT folders, not nesting WITHIN a
      component. Edit the "Component conventions" section to disambiguate: keep
      "a component is a flat directory of exactly four files (no sub-folders
      inside a component)", and add one sentence that components MAY be organized
      under nested parent folders (e.g. `landing/footer/`), created by `adx create
      <path>/<component-name>`, where the last path segment is the component
      directory/name. Do not weaken the token-efficiency rationale; frame
      grouping as optional organization. Leave `.kiro/steering/product.md`
      unchanged — a grep confirmed it states no flat-only rule; note it was
      checked and left as-is.
      Files: .kiro/steering/structure.md
      Verify: manual read-back; steering files are not compiled or tested.

- [ ] 8. Full regression gate: run the whole test suite and the TypeScript build
      to confirm nothing else broke (compiler, pages, pattern, init all
      untouched).
      Files: (none — verification only)
      Verify: `npm run build` compiles with no errors (`tsc -p tsconfig.json`),
      then `npm test` (`vitest run`) — ALL suites pass, including
      `test/create.test.ts`, `test/cli-commands.test.ts`, `test/pattern.test.ts`,
      and `test/init.test.ts`. Optionally run `npm run lint` for the edited TS.

## Out of scope (do not change)

- The compiler, page composition / resolution, or any command other than
  `create`.
- `usage()` (pinned byte-for-byte by a regression test).
- `validateComponentName`'s signature and flat-name error message (preserved so
  the flat case stays byte-for-byte identical).
- `parseArgs` / `ParsedArgs` (no parser change needed — `runCreate` already
  passes `args.dir` and relies on the thrown `[ADX]` error).

## Assumptions

- The nested-path error subject echoes the full user input (e.g.
  `landing//footer`), consistent with how `validateComponentName` echoes its
  argument. If the review prefers the offending segment instead, that is a
  message-wording tweak only and does not change control flow.
- `docs/adx-grammar.md` does not document the create argument grammar (confirmed
  by grep), so it is intentionally left unedited.
