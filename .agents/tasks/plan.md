# ADX Milestone 2 — Implementation Plan

Derived from the APPROVED design at `.agents/tasks/m2-design.md` (revision 3) and
`docs/roadmap.md` "Milestone 2". All paths are relative to the worktree root
`.worktrees/adx-m2/`. Verification uses the project's real commands:
`npm test` (= `vitest run`) and `npm run build` (= `tsc -p tsconfig.json`).

Baseline confirmed: 77 M1 tests green, `tsc` clean. The fixture `user-card` has a
`name` prop that is `required` with **no default**, so Phase 1's required-prop
validation will change the result of compiling it without data — the Phase 1 and
cross-cutting items update the affected M1 tests/fixtures (design Risk 6).

Ordering is by dependency: Phase 1 (data + sandbox + compute-key) is foundational;
Phases 2 and 3 build on `resolveProps`/sandbox; Phase 4 enriches the hook record
and glue the composition/page paths already emit; Phases 5 and 6 are independent
tails. Each item leaves the tree buildable and green.

---

## Phase 1 — Real data binding (`--data` + sandboxed `setup()`)

- [ ] 1. Add the shared `bareComputedKey` helper.
      Create `src/behavior/compute-key.ts` exporting
      `bareComputedKey(exportName: string): string` — strip the leading `get`
      (3 chars), lowercase ONLY the first remaining char, leave the rest verbatim
      (`getDisplayName→displayName`, `getURL→uRL`, `getX→x`). Export it from
      `src/index.ts`.
      Files: `src/behavior/compute-key.ts`, `src/index.ts`.
      Verify: add `test/compute-key.test.ts` (table-driven, incl. the `getURL→uRL`
      acronym case); `npm test` passes it and all 77 existing.

- [ ] 2. Build the sandbox runner `runSetup`.
      Create `src/behavior/run.ts` exporting
      `runSetup(behaviorSrc, props, behavior, opts?): { state, computed }` using
      `node:vm`. Steps per design Phase 1 "Sandbox construction": (a) freeze a
      minimal seed of globals (`Object,Array,String,Number,Boolean,Math,JSON,
      Date,RegExp,Map,Set,Symbol,Infinity,NaN,undefined`, no-op `console`, no-op
      `emit`), omit `require/module/exports/process/global/globalThis/Buffer/
      timers/fetch/import/node:*`; (b) strip ONLY the leading `export ` keyword of
      each `EXPORT_RE` match (reuse the scanner's regex), left-to-right splice,
      preserving `export function|async function|function*|const|let|var` forms;
      (c) if `!behavior.hasSetup` throw the exact `Missing required export
      "setup"` error BEFORE appending any invocation; (d) append
      `;globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__);`; inject
      `globalThis.__ADX_PROPS__ = props` into the context; one timed
      `runInContext(ctx,{timeout: opts?.timeoutMs ?? 1000})` evaluates the module
      and runs `setup`, read back `ctx.__ADX_STATE__` (NO clone — same reference
      to the emitter and to `get*`); (e) build `computed` as a map of
      `bareComputedKey(name)→thunk`, each thunk a pre-compiled per-`get*`
      `vm.Script` of `globalThis.__ADX_COMPUTED__ = <getName>(globalThis.__ADX_STATE__);`
      run under its own timed `runInContext`, read back `ctx.__ADX_COMPUTED__`.
      Map failures to `AdxError` on `behavior.adx.js` (line-less) per the Phase 1
      error table (ReferenceError→`setup() failed: <msg>`, timeout→`setup()
      exceeded time budget (1000ms)`, throw→`setup() failed: <msg>`). `setup`
      returning a non-object → treat as `{}`.
      Files: `src/behavior/run.ts`, `src/index.ts` (export).
      Verify: add `test/behavior-run.test.ts` covering benign `setup`,
      `export const setup = (p)=>({…})` vs `export function setup`,
      `require('fs')`→ReferenceError-mapped `[ADX]` error, `while(true){}`→timeout,
      `getDisplayName` collected as `displayName`, an unused `get*` never invoked,
      no-`setup` fatal before invocation; `npm test` green.

- [ ] 3. Add `resolveProps` (merge + required validation) in `compile.ts`.
      Add `resolveProps(manifest, data, source: "standalone"|"page"|"composed")`
      → merged props = `defaultProps(manifest)` ⊕ `data` (shallow, data wins),
      then for each `required` prop with no own value throw the line-less
      `[ADX] manifest.json - Missing required prop "<name>" (<branch hint>)` with
      the hint selected by `source` (verbatim strings from the Phase 1 error
      table). Keep the stem identical across sources.
      Files: `src/compile.ts`.
      Verify: add `test/resolve-props.test.ts` (table-driven: merge precedence,
      each source's hint, pass-through when supplied); `npm test` green.

- [ ] 4. Wire `--data` and sandbox into the compile pipeline.
      `CompileOptions` gains `data?: Record<string, unknown>`. `compileComponent`
      computes `mergedProps = resolveProps(manifest, opts.data, "standalone")`,
      calls `runSetup(behaviorSrc, mergedProps, behavior)` →
      `scope = { state, props: mergedProps, computed }` (computed built via
      `bareComputedKey`). Extend `CodegenContext` (`src/codegen/context.ts`) with
      `mergedProps`. Keep `scopeId(manifest.name, basename(dir))` for the
      single-component path (unchanged ids). `checkComponent` runs the same path.
      Files: `src/compile.ts`, `src/codegen/context.ts`.
      Verify: `npm run build` clean; the integration tests in item 6 pass.

- [ ] 5. Bake merged props into the glue (hydration parity).
      In `src/codegen/glue.ts` change `buildProps` to read `ctx.mergedProps`
      (the exact object the HTML was built from) instead of recomputing manifest
      defaults; keep the `globalThis.__ADX_PROPS__[Component]` override merged on
      top. (The per-instance `INSTANCES` loop lands in Phase 3; this item only
      fixes the props source so first paint == build-time state.)
      Files: `src/codegen/glue.ts`.
      Verify: existing `test/glue-emit.test.ts` still green after update; the
      hydration-parity test in item 6 passes.

- [ ] 6. CLI `--data` flag + update M1 tests/fixture for required-prop change.
      Add `--data <file.json>` to `src/cli.ts` `parseArgs` (same pattern as
      `--tokens`); the CLI reads+parses the file (fatal `[ADX] <data-file> -
      Cannot read data file` / `Invalid JSON` / `Data must be a JSON object of
      props`) and passes the object as `opts.data`. Add
      `fixtures/user-card/data.json` (`{"name":"Ada Lovelace"}`). Update
      `test/compile.test.ts` and `test/seo-contract.test.ts` to pass
      `{ data: { name: "Ada Lovelace" } }` (or read the fixture data file) so the
      required `name` resolves; add an assertion that `<h2>` is non-empty. Add a
      jsdom hydration-parity integration test (`test/hydrate-parity.test.ts`):
      compile with data, render HTML into a DOM, run the glue module, assert
      DOM text/attrs unchanged before any event (add `jsdom` as a devDependency;
      keep it out of `files`).
      Files: `src/cli.ts`, `fixtures/user-card/data.json`,
      `test/compile.test.ts`, `test/seo-contract.test.ts`,
      `test/hydrate-parity.test.ts`, `package.json` (devDep `jsdom`).
      Verify: `npm run build` clean; `npm test` — all suites green (77 M1 +
      new), empty-`<h2>` bug gone.

---

## Phase 2 — Pages (JSON page manifest → one `index.html` per page)

- [ ] 7. Page manifest loader + types.
      Create `src/page/load.ts` exporting `loadPage(path)`/`parsePage(raw,file)`
      and `src/page/types.ts` (`PageManifest`, `PageComponent`). Validate per the
      Phase 2 field rules: required `page` (slug `^[a-z0-9]+(?:-[a-z0-9]+)*$`),
      `title`, `description`, non-empty `components[]` (each with required `use`,
      optional `data`); optional `lang`(default `en`), `canonical`(default `/` for
      index/home else `/<page>/`), `schema`. Errors line-less `[ADX] <page-file> -
      <message>` per the Phase 2 error table.
      Files: `src/page/types.ts`, `src/page/load.ts`, `src/index.ts`.
      Verify: add `test/page-load.test.ts` (validation table); `npm test` green.

- [ ] 8. `repoRoot` + repo-relative scopeId location helper.
      Add a helper (in `src/compile.ts` or `src/codegen/scope-location.ts`) that
      resolves `repoRoot` = nearest ancestor of the build input containing
      `package.json`, else the input dir; and
      `scopeLocation(repoRoot, absDir)` = `relative(repoRoot, absDir)` with path
      separators normalized to `/`. Used by page/composed paths (NOT the
      single-component M1 path, which keeps `basename`).
      Files: `src/compile.ts` (or new `src/codegen/scope-location.ts`).
      Verify: unit test asserts POSIX-normalized stable output across separators;
      `npm test` green.

- [ ] 9. `compilePage` orchestration + `wrapPageDocument`.
      Create `src/page/compile.ts` `compilePage(pageManifestPath, opts):
      CompiledPage`. For each `components[i]`: resolve `use` to an absolute
      component dir (relative to the page file's dir; a `.json` or
      `manifest.json`-less target → `Component not found` fatal), compile it via
      the shared single-component path passing `data` with source `"page"` and the
      repo-relative `scopeLocation` as scopeId location, collect body/CSS/glue.
      Concatenate bodies in order inside one `<main>`; union per-component CSS
      (deduped by resolved absolute dir); emit one glue module per DISTINCT
      component plus a page entry importing each. Add `wrapPageDocument(bodies,
      page)` taking the page SEO fields: emits `<html lang>`, per-page
      `<title>`/description/canonical/OG/Twitter, and schema-gated JSON-LD
      `{ "@context":"https://schema.org","@type":page.schema,"name":page.title }`.
      Keep `adx build <dir>` on M1's `wrapDocument` unchanged.
      Files: `src/page/compile.ts`, `src/index.ts`.
      Verify: `npm run build` clean; integration test in item 11.

- [ ] 10. CLI strict dispatch (page vs component).
      In `src/cli.ts`: positional arg ending in `.json` → page build
      (`compilePage`, write `<out>/<slug>/index.html` with `index`/`home`→root
      `<out>/index.html`, plus `style.css`/`glue.js`/`<comp>.behavior.js` beside
      each page); else a dir with `manifest.json` → component build (M1); else
      fatal `[ADX] <path> - Not a component directory or page manifest`.
      Files: `src/cli.ts`.
      Verify: `npm run build` clean; manual `node dist/cli.js build <page.json>`
      exercised by the item 11 test via the API.

- [ ] 11. Two-page fixture site + page integration/SEO tests.
      Add `fixtures/site/` with `index.json` + `about.json` page manifests and the
      components they use (reuse `user-card`; add a `site-header` with a default
      slot). Integration test: compile both pages, assert `index.html` and
      `about/index.html` contain resolved content, correct per-page title/
      description/canonical, `lang`, JSON-LD `@type`==schema & `name`==title, and
      zero `{{`. Assert `adx check <page.json>` passes when all instance required
      props are supplied and fails with the child's `[ADX] manifest.json -
      Missing required prop …` otherwise.
      Files: `fixtures/site/**`, `test/page-compile.test.ts`.
      Verify: `npm test` — new page suites + all prior green.

---

## Phase 3 — Component composition (custom tags, slots, prop passing, per-instance identity)

- [ ] 12. HTML-tag allowlist + `instanceBindingId`.
      Create `src/codegen/html-tags.ts` (curated `Set` of standard HTML tag
      names). Add additive `instanceBindingId(scope, instanceIndex, n)` →
      `` `${scope}-i${instanceIndex}-${n}` `` to `src/codegen/scope.ts`
      (leave `bindingId`/`scopeId` unchanged). Export both from `src/index.ts`.
      Files: `src/codegen/html-tags.ts`, `src/codegen/scope.ts`, `src/index.ts`.
      Verify: unit tests for the id shape and allowlist membership; `npm test`
      green. (The emit path switches to `instanceBindingId` in item 14; the M1
      single build becomes `i0`, so update the fixture/html-emit snapshot
      assertions in that item.)

- [ ] 13. Per-instance accumulator + instance ordinal in `CodegenContext`.
      Extend `src/codegen/context.ts` with a per-component `mergedProps`
      (already added in Phase 1) plus an `INSTANCES` accumulator (one record per
      emitted instance: `{ instanceIndex, props }`) and a shared page-global
      instance-ordinal counter owned by the top-level build (threaded by
      `compileComponent`/`compilePage`).
      Files: `src/codegen/context.ts`, `src/compile.ts`, `src/page/compile.ts`.
      Verify: `npm run build` clean; exercised by items 14–16 tests.

- [ ] 14. Custom-tag resolution + recursive instance emission + slots in `html.ts`.
      In `src/codegen/html.ts` (or a new `src/codegen/compose.ts` called by it):
      build a dep-resolution table once per component (index each `manifest.deps`
      dir by kebab(`manifest.name`) and dir basename). When an element's tag is
      not in the HTML allowlist and not `slot`, resolve it; otherwise if unknown
      throw `[ADX] structure.adx:<line> - Unknown component "<tag>" (not an HTML
      element; add to manifest deps)`. For a resolved tag: evaluate its `:prop`/
      plain attrs against the PARENT scope → child props; recurse via
      `emitComponentInstance(dir, props, projected, stack)` which runs
      `resolveProps(childManifest, props, "composed")` + `runSetup`, parses child
      structure, emits the child body with the child's own scopeId
      (`scopeLocation(repoRoot, childAbsDir)`), assigns the next instance ordinal,
      stamps `data-adx-i="i<ordinal>"` on each instance-root element and uses
      `instanceBindingId(scope, ordinal, n)` for `data-adx-b`. Dedupe CSS/glue by
      resolved absolute dir. Thread `stack: string[]` of absolute dirs; a repeat
      throws `[ADX] structure.adx:<line> - Dependency cycle: a -> b -> a`. Slots:
      child declares `<slot actions />` (unchanged); parent projects
      `<template slot="name">` (and bare non-template children → default slot);
      group projected content (`Map<slotName,Node[]>`), fatal on duplicate named
      projection (`Duplicate slot content for "x"`) and on a `slot="x"` the child
      does not declare (`Component "<tag>" has no slot "x"`); emit projected nodes
      under the PARENT's scope/instance-ordinal/hook-ids at the child `<slot>`
      position (drop the `data-adx-slot` placeholder in composed output).
      Files: `src/codegen/html.ts`, `src/codegen/compose.ts` (optional),
      `src/compile.ts`.
      Verify: unit tests (dep table, 2- & 3-node cycle, slot grouping);
      update `test/html-emit.test.ts` + fixture snapshot for the `i0` id change;
      `npm test` green.

- [ ] 15. Per-instance glue module in `glue.ts`.
      Rewrite `emitGlue` to emit, per distinct component: an `INSTANCES` array
      (each `{ i:"i<ordinal>", props: <that instance's mergedProps> }`), a module
      that loops over instances — each iteration selects its root via
      `[data-adx-c=SCOPE][data-adx-i=i<ordinal>]`, builds its own
      `state = setup(Object.assign({}, inst.props, overrides))`, its own `emit`
      closure on that root, a `byHook` scoped to that root (via the templated
      `{i}` in each hook id), and wires events as
      `(event)=>{ globalThis.emit = emit; handler(state,event); rerender(); }`.
      Keep `evalExpr`/`applyUpdate`/`toText` as shared pure module-level helpers
      (the `rerender` body is filled in Phase 4; here it may be a no-op loop over
      the still-empty `updates`).
      Files: `src/codegen/glue.ts`.
      Verify: update `test/glue-emit.test.ts`; `npm test` green.

- [ ] 16. Composition integration + per-instance tests.
      Integration (jsdom): a page composing `site-header` (default slot) +
      `user-card` (`slot="actions"`); assert child content appears inside parent
      markup, each component's `data-adx-c` is its own id, both CSS blocks appear
      once and scoped, zero `{{`. Required: a page using one component twice with
      different data → distinct `data-adx-b` and `data-adx-i` per instance,
      dispatching an event on each patches that instance only; a child that
      `emit`s on click used twice → clicking the second instance delivers the
      event with `event.target` inside the second instance's `data-adx-i="i1"`
      subtree. Slot-ownership: projected `{{parentState}}` + `@event` carries the
      PARENT's `data-adx-c`/`data-adx-i` and patches from parent state.
      Files: `test/compose.test.ts`, `fixtures/site/**` (site-header etc.).
      Verify: `npm test` — all green.

---

## Phase 4 — Reactivity semantics (patch contract, no vDOM)

- [ ] 17. Enrich `BindingHook` with `updates` + computed freeze in `html.ts`.
      Add `UpdateInstr`/`SerExpr`/`SerPart` types and `updates: UpdateInstr[]` to
      `BindingHook`. Widen hook emission: emit a hook when a node has bindings OR
      events OR a single interpolated text run (children are exactly one `TextNode`
      with ≥1 `{{expr}}` part). Lower each `:prop` binding to an `attr`/
      `attrTemplate` UpdateInstr and the single text run to a `text`/`textTemplate`
      UpdateInstr (1:1 map of the AST `Expr` → `SerExpr`). Define `rootIdent(e)`
      (unwrap member chain to base ident) and build `computedKeys =
      new Set(ctx.behavior.computed.map(bareComputedKey))`; FREEZE (emit no
      UpdateInstr) any run where `computedKeys.has(rootIdent(expr))` — for
      templates, freeze the whole run if ANY part's root ident is computed.
      `:for`-unrolled nodes get events-only hooks (text/attrs frozen). An element
      with both an `@event` and state-backed `{{count}}` → one hook with the event
      and a `text` UpdateInstr.
      Files: `src/codegen/html.ts`, `src/index.ts` (export new types).
      Verify: unit tests in `test/html-emit.test.ts`/new file: `:src`, `{{name}}`,
      template attr round-trip; combined event+`{{count}}`; `:for`+event
      events-only; computed `{{displayName}}` → NO text update (frozen),
      `{{displayName.foo}}` frozen, state `{{count}}` → one update; `npm test`
      green.

- [ ] 18. Runtime patch in the per-instance glue.
      Fill the `rerender`/`applyUpdate`/`evalExpr`/`joinParts`/`toText`/
      `setOrRemoveAttr` logic in `src/codegen/glue.ts`: emit the compiled `HOOKS`
      array (events + serialized `updates`); per-instance `rerender` re-applies
      every hook's `updates` against that instance's `state`, resolving nodes only
      within that instance's `root`. `evalExpr` mirrors `evaluate.ts`'s
      ident/member walk over the single `state` object; attrs removed on
      null/undefined. First `rerender` after hydration is a no-op for a
      deterministic `setup`.
      Files: `src/codegen/glue.ts`.
      Verify: update `test/glue-emit.test.ts`; `npm test` green.

- [ ] 19. Reactivity DOM integration tests (jsdom).
      In `test/reactivity.test.ts`: emit glue for a fixture, run under jsdom;
      dispatch a wired event and assert state-backed `{{count}}` text/attrs patch;
      assert a `getDisplayName`-backed `<h2>{{displayName}}</h2>` is UNCHANGED
      (not blanked) after `rerender`; assert a `:for` item does not live-update.
      Files: `test/reactivity.test.ts` (+ a small reactivity fixture if needed).
      Verify: `npm test` — all green.

---

## Phase 5 — Measured token benchmark

- [ ] 20. Benchmark harness + `measure` + `npm run benchmark`.
      Create `benchmark/` with `tasks.json` (understand/modify-style/add-prop file
      sets), `react/` (a committed React equivalent of `user-card` meeting the
      design's equivalence rule: same DOM/text, same props, same styling surface),
      `adx/` (copy/symlink of the measured fixture), `run.ts` (tokenizes each file
      with `gpt-tokenizer` `o200k_base`, computes `savings=(react-adx)/react`,
      writes a table to stdout + `benchmark/results.json`), and `README.md` with
      reproduction + an "Equivalence" note. Factor the math into a pure
      `measure(fileSets): Results`. Add `gpt-tokenizer` (exact pinned version) as
      a devDependency and
      `"benchmark": "tsc -p tsconfig.json && node dist/benchmark/run.js"`; keep
      `benchmark/` out of the published `files` list.
      Files: `benchmark/**`, `package.json`.
      Verify: add `test/benchmark-measure.test.ts` (pure `measure` with in-memory
      strings + stubbed encoder); `npm test` green; `npm run benchmark` runs and
      writes `results.json`.

---

## Phase 6 — Documentation sync (same change; mark only what works)

- [ ] 21. Sync all docs to the shipped M2 behavior.
      Update: `docs/adx-grammar.md` (custom-tag resolution; `<slot actions />`
      declaration vs `<template slot="name">` projection, `<slot name="actions"/>`
      is NOT valid, `#name` noted as planned sugar that is *already parseable*;
      build-time slots; `data-adx-slot` only in standalone; `data-adx-i` +
      `${scope}-i${ordinal}-${n}` hook id; §4.3 `get*`→bare-key rule incl.
      `getURL→uRL`). `docs/agent-reference.md` (`--data`, page build +
      `adx build <page.json>`, composition syntax, reactivity contract + limits,
      `npm run benchmark`; update IMPLEMENTED vs PLANNED). `docs/human-guide.md`
      (worked 2-page site from 2 composed components with real data; replace
      `#actions` examples with `slot="actions"` + planned-`#` note; fix the
      "scanned, never executed" phrasing to sandboxed `setup()`).
      `docs/architecture.md` (build-time sandbox; reactivity patch model; security
      note). `docs/comparison.md` + `docs/token-efficiency.md` (add a "Measured
      (M2)" section with the real table; label the prior "65-85%" figure as
      estimated; adjust the headline claim to the measured range if below it).
      `docs/roadmap.md` (flip ONLY the actually-shipped M2 items from ❌/🚧 to ✅;
      update "Next up"). `README.md` (roadmap rows + "Next up"; keep version
      accurate).
      Files: `docs/adx-grammar.md`, `docs/agent-reference.md`,
      `docs/human-guide.md`, `docs/architecture.md`, `docs/comparison.md`,
      `docs/token-efficiency.md`, `docs/roadmap.md`, `README.md`.
      Verify: `npm run build` + `npm test` still green (docs-only); manual read:
      the "Measured (M2)" table numbers match `benchmark/results.json`; roadmap
      marks match reality.

---

## Cross-cutting Definition of Done

- `npm test` green: all 77 M1 tests (updated where Phase 1's required-prop change
  demands) plus every new unit/integration suite.
- `npm run build` (`tsc`) clean.
- `npm run benchmark` produces measured numbers; docs reflect them honestly.
- Raw emitted HTML (pre-JS) for pages/components contains real resolved content,
  correct metadata, and zero `{{` — verified by SEO integration tests.
