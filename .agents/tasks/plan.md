# Implementation Plan — ADX Compiler Milestone 1

Scope: a TypeScript/Node compiler (npm package) in `compiler/` that turns a single
`.adx` component directory into **complete static HTML + plain CSS + a tiny
hydration-only ES-module glue script**. CLI exposes `adx build` and `adx check`
for one component. No dev server, no patterns, no WCAG audit, no sitemap/robots —
those stay planned.

All paths are relative to the worktree root
`/Users/pirrima001/coding/personal/project_adx_0/.worktrees/adx-compiler-m1`.

## Design decisions settled here (do not re-litigate)

- **Stack**: TypeScript on Node, ESM (`"type": "module"`), bundled/distributed as an
  npm package. Build with `tsc`. Test with **Vitest**. Lint with **ESLint** (flat
  config) + `@typescript-eslint`. Rationale: matches the binding decision (TS/Node,
  ES-module output) and Vitest is the lightest zero-config runner for an ESM TS lib.
- **Parser strategy**: hand-written tokenizer + recursive-descent parser for
  `structure.adx` → explicit AST (shape and rules fixed in `docs/adx-grammar.md`).
  Rationale: the grammar is tiny and token-efficiency/determinism matter more than a
  parser-generator dependency; a hand parser gives exact control over the
  `[ADX] <file>:<line> - <message>` errors.
- **Expression evaluation**: build-time **safe property walker** over `ident` /
  `member` only (no `eval`, no JS operators), per grammar §5. Computed `getXxx`
  values resolve by bare name. Rationale: SEO requires build-time resolution, and a
  restricted evaluator avoids executing arbitrary user code at compile time.
- **behavior.adx.js**: discover exports **by name** via a lightweight source scan
  (regex/He­uristic over `export function <name>`), NOT a full JS parse. Classify
  into `setup`, `on*` (events), `get*` (computed), lifecycle
  (`onMounted/onUnmounted/onUpdated`). Rationale: the compiler only needs the export
  surface to wire glue; deep-parsing JS is out of scope and costly.
- **HTML scoping**: deterministic per-component scope id = short hash of the
  component name + relative path. Emit it as a `data-adx-c="<id>"` attribute on
  every element the component owns, and scope CSS by prefixing selectors with
  `[data-adx-c="<id>"]`. Rationale: attribute scoping needs no class rewriting, keeps
  authored class names intact (good for humans + crawlers), and is fully
  deterministic (reproducible builds).
- **CSS transform**: expand abbreviated props (`pad/bg/radius/size/weight` + the
  documented layout/visual/typography set), resolve `tokens.*` from
  `tokens/design-tokens.json`, auto-scope, pass media queries through (rewriting
  `tokens.breakpoint-*` inside `@media`). Unknown token →
  `[ADX] style.adx.css:<line> - Unknown token "tokens.space-5" (available: 0,1,2,3,4,6,8,12,16)`.
- **Hydration glue (Option 1)**: emit one ES module per component that imports the
  behavior exports, calls `setup(props)` once to get state, queries existing DOM by
  the scope id + stable `data-adx-*` hooks (NOT by rebuilding DOM), attaches
  `@event` handlers, and on handler invocation re-runs only the affected
  `{{bindings}}`/text nodes. No shared runtime, no vDOM.
- **Output layout** (per component build): `dist/<component>/index.html`,
  `dist/<component>/style.css`, `dist/<component>/glue.js`. `adx check` validates and
  emits nothing.

## Plan

- [ ] 1. Scaffold the compiler package.
      Create `compiler/package.json` (`"type":"module"`, name `adx-compiler`, bin
      `adx` → `dist/cli.js`, scripts: `build`=`tsc -p tsconfig.json`,
      `test`=`vitest run`, `lint`=`eslint .`), `compiler/tsconfig.json`
      (target ES2020, module NodeNext, `rootDir src`, `outDir dist`, strict),
      `compiler/vitest.config.ts`, `compiler/eslint.config.js` (flat, TS plugin),
      and an empty `compiler/src/` with a placeholder `src/index.ts` so the build
      passes. Add `compiler/.gitignore` for `dist/` and `node_modules/`.
      Files: compiler/package.json, compiler/tsconfig.json,
      compiler/vitest.config.ts, compiler/eslint.config.js, compiler/.gitignore,
      compiler/src/index.ts
      Verify: `cd compiler && npm install && npm run build && npm test` — install
      succeeds, `tsc` produces `dist/`, Vitest runs (0 tests OK at this point).

- [ ] 2. Create the design-token source of truth.
      Create `tokens/design-tokens.json` at the worktree root encoding every token
      from `docs/agent-reference.md`: spacing `space-0,1,2,3,4,6,8,12,16` (px on 4px
      scale), colors `surface-0..3`, `text-1..3`, `primary`, `secondary`, `success`,
      `warning`, `error`, `info`, `border`; `radius-sm|md|lg|full`; `shadow-sm|md|lg`;
      typography `text-xs..3xl`, `weight-normal|medium|bold`, `font-sans|serif|mono`;
      breakpoints `breakpoint-sm|md|lg|xl`. Use concrete, documented values where
      given (space px, text px, weights 400/500/700, radii 4/8/12/9999, breakpoints
      640/768/1024/1280) and sensible light-theme hex for colors. Structure it so a
      loader can map `tokens.<name>` → value and list available spacing indices for
      the error message.
      Files: tokens/design-tokens.json
      Verify: `cd compiler && node -e "JSON.parse(require('fs').readFileSync('../tokens/design-tokens.json','utf8'))"` — parses without error (and later consumed by the token-loader unit tests in item 7).

- [ ] 3. Add the UserCard fixture component (compiler input for tests).
      Create `compiler/fixtures/user-card/` with all four files taken from the docs:
      `manifest.json`, `structure.adx`, `behavior.adx.js`, `style.adx.css`
      (use the `human-guide.md` UserCard: article.card, img, content div, name/role,
      `:if="bio"`, `<slot actions />`; behavior `setup/onClick`; token-based styles).
      This is the golden input every later stage compiles against.
      Files: compiler/fixtures/user-card/manifest.json,
      compiler/fixtures/user-card/structure.adx,
      compiler/fixtures/user-card/behavior.adx.js,
      compiler/fixtures/user-card/style.adx.css
      Verify: `cd compiler && npm test` still green (fixture is data; no test depends
      on it yet).

- [ ] 4. Implement shared error + source-position utilities.
      Create `src/errors.ts` with an `AdxError` class and a `formatError(file, line,
      message)` helper producing exactly `[ADX] <file>:<line> - <message>` (and a
      line-less variant for `manifest.json`). Add `src/source.ts` with a tiny helper
      that maps string offsets → 1-based line numbers.
      Files: compiler/src/errors.ts, compiler/src/source.ts,
      compiler/test/errors.test.ts
      Verify: `cd compiler && npx vitest run test/errors.test.ts` — asserts the exact
      message formats pass.

- [ ] 5. Implement the structure tokenizer + parser → AST.
      Create `src/structure/tokenizer.ts` and `src/structure/parser.ts` implementing
      `docs/adx-grammar.md`: elements/self-close/void elements, `.class` shorthand,
      `:prop` bindings, `@event`, plain attrs, `{{interp}}` in text and attribute
      values, `:if/:else/:for/:key` directives with the fixed outer-to-inner
      evaluation order, `<slot name />`, class merge precedence (§2.5), the restricted
      expression grammar (`ident`/`member` only), and the exact error messages.
      Export `parseStructure(src, file): Node[]` returning the AST in grammar §8 shape.
      Create `src/structure/ast.ts` for the types and `src/expr/parse-expr.ts` for the
      expression sub-parser.
      Files: compiler/src/structure/tokenizer.ts,
      compiler/src/structure/parser.ts, compiler/src/structure/ast.ts,
      compiler/src/expr/parse-expr.ts, compiler/test/structure-parser.test.ts
      Verify: `cd compiler && npx vitest run test/structure-parser.test.ts` — tests
      cover the UserCard fixture AST, `:for` with index + key, `:if/:else` pairing,
      attribute interpolation, class merge, and each error case (unterminated interp,
      `:else` without `:if`, duplicate slot, mismatched close tag) asserting the exact
      `[ADX]` message.

- [ ] 6. Implement manifest load + schema validation.
      Create `src/manifest/load.ts` exporting `loadManifest(dir): Manifest` that reads
      `manifest.json`, validates required `name`/`version` and the `props`/`emits`/
      `slots`/`deps` shapes, and throws `AdxError` with line-less format
      (`[ADX] manifest.json - Missing required field "name"`). Define `Manifest` types
      and allow optional SEO metadata fields (title/description/schema) to pass through
      without error (parsed, not yet used).
      Files: compiler/src/manifest/load.ts, compiler/src/manifest/types.ts,
      compiler/test/manifest.test.ts
      Verify: `cd compiler && npx vitest run test/manifest.test.ts` — valid UserCard
      manifest loads; missing-name and bad-prop-type cases throw the exact message.

- [ ] 7. Implement the token loader.
      Create `src/tokens/load.ts` exporting `loadTokens(path): TokenTable` with
      `resolve(ref): string` (maps `tokens.space-4` → `16px`, etc.) and
      `availableSpacing(): string` returning `0,1,2,3,4,6,8,12,16` for the error
      message. Unknown ref throws nothing here (callers format the CSS error) but
      exposes `has(ref)`.
      Files: compiler/src/tokens/load.ts, compiler/src/tokens/types.ts,
      compiler/test/tokens.test.ts
      Verify: `cd compiler && npx vitest run test/tokens.test.ts` — resolves known
      tokens against `tokens/design-tokens.json`, reports availability correctly.

- [ ] 8. Implement the behavior export scanner.
      Create `src/behavior/scan.ts` exporting `scanBehavior(src, file): BehaviorApi`
      that finds `export function <name>` (and `export const <name> =`) by name and
      classifies into `setup`, events (`on<Event>`), computed (`get<Name>`), lifecycle
      (`onMounted/onUnmounted/onUpdated`). No deep JS parsing. Record names only.
      Files: compiler/src/behavior/scan.ts, compiler/src/behavior/types.ts,
      compiler/test/behavior-scan.test.ts
      Verify: `cd compiler && npx vitest run test/behavior-scan.test.ts` — the
      UserCard behavior yields `setup` + `onClick`; a sample with get*/lifecycle
      classifies correctly.

- [ ] 9. Implement the build-time expression evaluator + scope.
      Create `src/expr/evaluate.ts` with `evaluate(expr, scope): unknown` — a safe
      walker over `ident`/`member`, resolving inner `:for` scope → `setup` state →
      `props` → computed `getXxx` results, returning `undefined` for unknowns (per
      grammar §5, §4.3). Provide `truthy()` and `toText()` helpers (empty string is
      falsy; `undefined`/`null` → `""`).
      Files: compiler/src/expr/evaluate.ts, compiler/test/evaluate.test.ts
      Verify: `cd compiler && npx vitest run test/evaluate.test.ts` — member access,
      loop-var shadowing, computed-name resolution, and falsy/empty rules pass.

- [ ] 10. Implement the HTML emitter (complete static HTML).
      Create `src/codegen/html.ts` exporting `emitHtml(ast, ctx): string`. Walk the
      AST: resolve every `{{interp}}` and `:prop` at build time, apply `:if/:else`
      (omit falsy branches), expand `:for` (render one copy per item in loop scope),
      emit named/default slots as `data-adx-slot="<name>"` placeholders, add
      `data-adx-c="<scopeId>"` to owned elements plus stable `data-adx-b` hooks on
      nodes carrying bindings/events (for the glue), preserve semantic tags, and
      self-close void elements. Output is complete, crawlable HTML with no `{{ }}`
      remaining.
      Files: compiler/src/codegen/html.ts, compiler/src/codegen/scope.ts,
      compiler/test/html-emit.test.ts
      Verify: `cd compiler && npx vitest run test/html-emit.test.ts` — compiling the
      UserCard fixture with sample state yields HTML containing resolved text, correct
      `:if` omission, `:for` expansion, slot placeholder, and zero `{{`; snapshot
      asserted.

- [ ] 11. Implement the CSS transform.
      Create `src/codegen/css.ts` exporting `transformCss(src, ctx): string`: strip
      `@use tokens;`, expand abbreviated props to real CSS (`pad`→`padding`,
      `bg`→`background`, `radius`→`border-radius`, `size`→`font-size`,
      `weight`→`font-weight`, plus the documented layout/visual/typography set),
      resolve every `tokens.*` via the token loader, auto-scope each selector with the
      `[data-adx-c="<id>"]` prefix, and pass `@media` through while resolving
      `tokens.breakpoint-*`. Unknown token → the exact
      `[ADX] style.adx.css:<line> - Unknown token "..." (available: ...)` error.
      Files: compiler/src/codegen/css.ts, compiler/test/css-transform.test.ts
      Verify: `cd compiler && npx vitest run test/css-transform.test.ts` — UserCard
      styles expand + scope + resolve tokens; `tokens.space-5` throws the exact error
      with the available list; media query with `breakpoint-md` resolves to `768px`.

- [ ] 12. Implement the hydration glue emitter (Option 1).
      Create `src/codegen/glue.ts` exporting `emitGlue(ast, behavior, ctx): string`:
      an ES module that imports the behavior exports, calls `setup(props)` once,
      selects existing DOM nodes by `data-adx-c`/`data-adx-b` hooks (never rebuilds
      DOM), attaches each `@event` to its handler, and defines an update routine that
      re-runs only the affected bindings/text on handler invocation. Must emit no
      shared-runtime import and no vDOM.
      Files: compiler/src/codegen/glue.ts, compiler/test/glue-emit.test.ts
      Verify: `cd compiler && npx vitest run test/glue-emit.test.ts` — generated glue
      is valid ESM (parseable), imports `onClick`, references the scope hooks, and
      contains no DOM-construction (`createElement`) calls; asserted by string checks
      on the emitted module plus a `new Function`/`import()`-shape parse.

- [ ] 13. Wire the end-to-end compile pipeline.
      Create `src/compile.ts` exporting `compileComponent(dir, opts): {html, css,
      glue}` and `checkComponent(dir)` that run manifest → structure parse → behavior
      scan → tokens → emit (html/css/glue). `check` runs every validation and emit
      step but writes nothing; `compile` returns the three artifacts.
      Files: compiler/src/compile.ts, compiler/test/compile.test.ts
      Verify: `cd compiler && npx vitest run test/compile.test.ts` — compiling the
      UserCard fixture end-to-end returns all three artifacts and `checkComponent`
      resolves without throwing on the valid fixture and throws the right `[ADX]`
      error on a deliberately broken copy.

- [ ] 14. Implement the CLI (`adx build` / `adx check`).
      Create `src/cli.ts` with a `#!/usr/bin/env node` shebang: parse argv for
      `build <componentDir> [--out dist] [--tokens tokens/design-tokens.json]` and
      `check <componentDir>`. `build` writes `dist/<name>/index.html|style.css|
      glue.js`; `check` prints OK or the `[ADX]` error and exits non-zero on failure.
      No other subcommands. Ensure `bin` in package.json points at `dist/cli.js`.
      Files: compiler/src/cli.ts, compiler/test/cli.test.ts
      Verify: `cd compiler && npm run build && node dist/cli.js build fixtures/user-card --out dist && node dist/cli.js check fixtures/user-card` — build writes the three files under `dist/user-card/`, `check` exits 0; a broken fixture makes `check` exit non-zero with the `[ADX]` message. `npx vitest run test/cli.test.ts` passes.

- [ ] 15. Verify the SEO contract on real output.
      Add a test (and manual check) that the emitted `dist/user-card/index.html`
      contains the resolved text content (no `{{`), correct semantic tags, and that
      no JS execution is needed to see content. Confirm heading order is preserved
      from the fixture.
      Files: compiler/test/seo-contract.test.ts
      Verify: `cd compiler && npm run build && node dist/cli.js build fixtures/user-card --out dist && grep -L "{{" dist/user-card/index.html >/dev/null && npx vitest run test/seo-contract.test.ts` — the HTML has no unresolved interpolation and the SEO test passes.

- [ ] 16. Documentation sync (REQUIRED).
      Update docs to reflect what now works, keeping agent-reference.md compact and
      human-guide.md/README warm; flip only build/check-for-one-component from
      "planned" to real, leaving dev/create/tokens/pattern, WCAG audit, and
      sitemap/robots as planned. Specifically:
      - `docs/architecture.md`: add a short "Compiler (M1, implemented)" note on the
        build-time static-HTML + hydration-glue pipeline and attribute scoping.
      - `docs/agent-reference.md`: in the Compilation section mark `adx build`/`adx
        check` as working (single component); keep others planned; link
        `adx-grammar.md`.
      - `docs/human-guide.md`: add a brief "Compiling a component today" subsection
        with the real `node dist/cli.js build ...` invocation.
      - `README.md`: flip Compiler/Design Token System/Build System rows to in-progress
        with an M1 scope note; keep the rest unchanged.
      Files: docs/architecture.md, docs/agent-reference.md, docs/human-guide.md,
      README.md
      Verify: `cd compiler && npm run build && npm test && npm run lint` all pass, and
      a re-read of the four docs shows only the implemented slice flipped to real
      (planned items still labeled planned).

## Notes / assumptions

- The worktree's `.kiro/steering/` physically contains product/structure/tech/ux-ui
  but not seo.md/documentation.md (those apply as rules regardless). This plan does
  not add steering files; if the user wants them committed to the worktree, that is a
  separate change outside M1's compiler scope.
- Color hex values in `tokens/design-tokens.json` are not pinned by the docs; the
  implementer picks accessible light-theme defaults meeting the UX/UI contrast
  baseline. Dark-theme values are out of M1 scope.
- Slot content projection across components is parsed and hooked now but not fully
  resolved (later milestone), per grammar §6.
