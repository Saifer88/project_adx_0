# Review — `adx create <path>/<component-name>` (nested component paths)

Branch: `feat/create-nested-path` (commit `71d6d92`), base `1a9c585` (v0.2.2).
Diff inspected: `src/create.ts`, `src/cli.ts`, `test/create.test.ts`, `README.md`,
`docs/agent-reference.md`, `docs/human-guide.md`, `.kiro/steering/structure.md`,
plus task artifacts.

## Verdict: APPROVED

No blocking findings. The change meets the approved requirements.

## Evidence read (not re-run)

`verification.md` records: full suite `npm test` -> 28 files, 374 tests passing
(baseline 349, grew by 25, no regressions, including the byte-for-byte `usage()`
regression and the `adx help` listing test); `npm run build` -> exit 0, no TS
errors; end-to-end against the BUILT `dist/cli.js`: `create landing/footer`
wrote the four files under `landing/footer/`, manifest `"name": "Footer"`,
`check`/`build` succeeded, and `create landing//footer` was rejected (exit 1,
nothing written). Evidence is present and sufficient; suites were not re-run.

## Requirement-by-requirement

- **Nested paths accepted, mkdir -p prefix, last segment = component.**
  `parseComponentPath` splits on `/`, `templatedFiles` builds
  `<prefix>/<last>/…`, `writeFileSet` mkdir -p's parents. Confirmed in
  `src/create.ts` and the nested/arbitrary-depth tests.

- **Every segment independently passes the slug regex.**
  `parseComponentPath` runs each segment through the existing `NAME_RE`
  `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`. No new/divergent regex introduced.

- **PascalCase name from the LAST segment only.** `pascalCase(last)` where
  `last = segments[segments.length - 1]`. `contact-us/sidebar -> Sidebar`,
  `landing/footer -> Footer`, verified by tests.

- **Flat single-segment case preserved byte-for-byte.** For a bare name
  `dirs` is empty, so `prefix = last` and the four `path` values are identical
  to the prior `${name}/…`. File CONTENTS are untouched (the manifest name still
  flows from the pascal name). The flat SUCCESS output is genuinely unchanged.
  Note: the flat REJECTION path now flows through `parseComponentPath` (message
  `invalid component path …`) instead of `validateComponentName` (`invalid
  component name …`). This is not a byte-for-byte text match of the old flat
  rejection string, but (a) the task pins only rejection + exit 1 + nothing
  written for bad input, all preserved; (b) `validateComponentName` itself is
  exported unchanged and its regression test still passes; (c) the plan calls
  this out explicitly as an accepted message-wording consequence. Not a blocker.

- **Rejection + exit 1 + nothing written** for `landing//footer`, `landing/`,
  `/footer`, uppercase segment, `..` (`a/../b`), backslash (`a\b`), absolute,
  bad slug (`foo--bar`). All rejected before any write because
  `scaffoldComponent` calls `parseComponentPath(name)` first and throws; the
  CLI try/catch maps the throw to stderr + exit 1. Tests assert the target dir
  stays empty after each rejection.

- **Path traversal outside target impossible.** Every segment must match the
  strict slug, which cannot be empty, `.`, `..`, or contain `/` or `\`. A
  backslash never splits, so `a\b` is a single segment that fails the slug; an
  absolute path yields an empty leading segment that fails. A valid segment can
  only descend. Verified by logic and the rejection tests.

- **Conflict-safe no-partial-write guarantee preserved.** `src/scaffold.ts` is
  unchanged. `writeFileSet` checks all four files for existence BEFORE writing
  anything and throws `already exists; refusing to overwrite` on conflict. Only
  the four component files are the guarded set; creating into an existing prefix
  dir lacking them succeeds (test `succeeds into an existing prefix dir …`).

- **`usage()` UNCHANGED.** Not present in the diff; the new form is documented
  via the top-of-file doc comment and the `COMMANDS` table entry (which feeds
  `helpText()`), exactly as required.

- **Compiler and other commands untouched.** Diff touches only `src/create.ts`
  and two doc-comment/`COMMANDS` lines in `src/cli.ts`; no changes to compile,
  pages, pattern, init, or serve.

- **Documentation updated consistently.** `README.md`, `docs/agent-reference.md`,
  and `docs/human-guide.md` all document the `<path>/<component-name>` form with
  examples and the last-segment-name rule. `.kiro/steering/structure.md` is
  reconciled: it keeps "a component is a flat directory of four files (no
  sub-folders inside a component)" and adds that PARENT-folder grouping is a
  supported opt-in, distinct from within-component nesting — no silent
  contradiction of the flat-layout steering. `docs/adx-grammar.md` was
  intentionally left unchanged; a grep confirms it does not document the create
  argument grammar. The agent-reference note that a nested component is
  referenced via a relative `deps` path (`"./landing/footer"`) is consistent
  with `src/codegen/compose.ts`, which resolves deps relative to the using
  component's directory.

## Spot-check performed

One narrow spot-check: confirmed `compose.ts` resolves `manifest.deps` with
`resolve(ctx.absDir, dep)` (relative to the using component), so the new
agent-reference doc claim about referencing nested components by relative path
is accurate, not a contradiction.
