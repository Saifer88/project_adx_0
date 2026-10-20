# Design Check — `adx init` app-shell + optional Tailwind

Read-only investigation of the current scaffold/init/compose code in the worktree
`.worktrees/init-app-shell-tailwind`. Goal: let the plan EXTEND the existing
mechanisms (SCAFFOLD_FILES, writeFileSet clobber guard, compose/slot syntax, page
`assets`) without inventing anything new. Nothing below was edited.

---

## 1. Composition + named slots — EXACT syntax to reuse

ADX composition already exists (the `compose` fixtures) and the app-shell MUST reuse
it, not invent new manifest syntax. Concrete, verified shapes:

### Child component declares slots (manifest `slots`)
- Named slot: `fixtures/user-card/manifest.json` -> `"slots": ["actions"]`.
- Default/unnamed slot: `fixtures/site/site-header/manifest.json` -> `"slots": [""]`
  (the empty string is the default slot name).

### Child component renders slot outlets (`structure.adx`)
- Named outlet, self-closing with a class: `fixtures/user-card/structure.adx`
  ```adx
  <slot actions .actions />
  ```
  Pattern: `<slot <name> .<class> />` — bare slot name as the first token, dot-class
  shorthand, self-closing.
- Default outlet: `fixtures/site/site-header/structure.adx`
  ```adx
  <nav .nav>
    <slot .nav-slot />
  </nav>
  ```
  (no name token = default slot).

### Parent composes children + fills slots (`fixtures/compose/landing/`)
- `manifest.json` declares children via **`deps`** (array of component dirs relative
  to this component), e.g.:
  ```json
  "deps": ["../../site/site-header", "../../user-card"],
  "seo": { "title": "Landing", "schema": "WebPage" }
  ```
- `structure.adx` instantiates a child by its **kebab element name** (the directory
  basename, NOT the manifest `name`), binds props with `:prop="expr"` / literal
  `prop="value"`, and fills slots two ways:
  ```adx
  <div .landing>
    <site-header :siteName="brand" current="home">
      <a .nav-link @click="onNav">Home for {{brand}}</a>   <!-- default slot: bare children -->
    </site-header>
    <user-card :name="who" :role="role">
      <template slot="actions">                            <!-- named slot: <template slot="..."> -->
        <button .follow @click="onFollow">Follow {{who}}</button>
      </template>
    </user-card>
  </div>
  ```
- The parent `behavior.adx.js` is plain pure functions (`setup(props)` returns
  state; `onX(state)` calls `emit(...)`), same as any component.

**Rules captured (do not deviate):**
- Child element tag = directory basename in kebab-case (`site-header`, `user-card`).
- Every child used in `structure.adx` must be listed in the parent manifest `deps`.
- Default-slot content = bare children of the element; named-slot content =
  `<template slot="NAME">...</template>`.
- Slot outlet in the child = `<slot [name] .class />`; declared in child manifest
  `slots` (named string, or `""` for default).

**App-shell implication:** the shell is a parent component with a default slot (and
possibly named slots like `header`/`footer`). Model it on `landing` (deps +
`<slot/>` outlets) and `site-header` (`"slots": [""]` + `<slot .x />`). The starter
page `index.json` would place the shell, and the shell would wrap `hello-card`. Keep
every prop defaulted (see §6).

---

## 2. Page/site `assets` and the Tailwind recipe — EXACT shape

### `assets` block shape (page manifest OR `site.json`)
From `docs/agent-reference.md#external-design-library-assets` and README:
```json
{ "assets": { "css": ["/tailwind.css"], "js": [{ "src": "/app.js", "type": "module" }], "head": ["<meta ... />"] }, "lang": "en" }
```
- `css`: non-empty URL strings.
- `js`: URL strings OR objects `{ src (required), type?, defer?, async? }`.
- `head`: raw HTML strings injected verbatim after the CSS links (trusted authors).
- Merge order: **site then page**; CSS deduped by exact URL, JS by `src` (first
  wins); `head` not deduped. Language precedence: page > site > `en`.
- **ADX links external CSS AFTER its own `style.css`** (document-order only, NOT an
  override guarantee — scoped unlayered ADX rules can still outrank Tailwind v4
  layered utilities). This is the "link after, not CDN runtime" contract.
- URLs resolve against the **emitted document**, not the manifest. `/tailwind.css`
  must physically exist at `dist/tailwind.css`. ADX never copies/generates/checks
  asset files.
- Scope: **pages only**. `--site <path>` must be passed to BOTH `build` and
  `check`; no auto-discovery.

### The blessed Tailwind v4 recipe (build-time static CSS, NOT Play CDN)
From both docs. The agent runs the Tailwind CLI; ADX only references the output.
Minimal `styles/tailwind.css` input:
```css
@import "tailwindcss" source("../");
```
`site.json`:
```json
{ "assets": { "css": ["/tailwind.css"] } }
```
Build sequence (author-run, never by ADX):
```bash
npm install -D tailwindcss@4 @tailwindcss/cli@4
npx @tailwindcss/cli -i styles/tailwind.css -o dist/tailwind.css --minify
npm run check -- --site site.json
npm run build -- --site site.json
```
- Use literal `class="p-2.5 md:grid hover:underline w-1/2"` in markup. Dot-class
  shorthand (`.foo`) only accepts `[a-zA-Z][a-zA-Z0-9_-]*` and REJECTS variants,
  fractions, decimals, arbitrary values, negatives (`.md:grid`, `.w-1/2`, `.p-2.5`,
  `.w-[37px]`, `.-mt-2`, `.p-4!` are all invalid as dot-shorthand -> must use
  `class="..."`).
- Keep Tailwind directives in the separate input CSS, NEVER in `style.adx.css`.
- **Never inject the Play CDN `<script>`** into a component — breaks the
  static/crawlable/minimal-JS contract.

**`--tailwind` init implication:** when the flag is set, the scaffold should add the
build-time static-CSS wiring READY to install but must NOT run npm or the Tailwind
CLI (see §6). Candidate additions: pin `tailwindcss`/`@tailwindcss/cli` into the
generated `package.json` devDependencies, emit `styles/tailwind.css`
(`@import "tailwindcss" source("../");`), emit `site.json`
(`{"assets":{"css":["/tailwind.css"]}}`), and document the manual CLI + `--site`
build steps. (Plan must decide exact files; this is the shape to mirror.)

---

## 3. Clobber-guard contract + routing new files through SCAFFOLD_FILES

`src/scaffold.ts`:
- `SCAFFOLD_FILES: { path: string; contents: string | (() => string) }[]` is the
  **single source of truth** for everything `adx init` writes. Current entries:
  `hello-card/{manifest.json,structure.adx,behavior.adx.js,style.adx.css}`,
  `tokens/design-tokens.json`, `index.json`, `README.md`, `package.json` (a THUNK:
  `packageJson`), `.gitignore` (inline `"node_modules/\ndist/\n"`), `AGENTS.md`.
- `scaffoldProject(targetDir)` resolves EVERY thunk into a concrete string BEFORE
  writing (so a throwing thunk writes nothing), then calls `writeFileSet`.
- `writeFileSet(base, files)` is the shared no-partial-write guard used by init,
  create, pattern:
  1. First loop: if ANY resolved path `existsSync`, throw
     `[ADX] <abs> - already exists; refusing to overwrite` BEFORE any mkdir/write —
     conflict leaves target untouched.
  2. Second loop: `mkdirSync(dirname, {recursive:true})` + `writeFileSync` each, in
     order. Returns the input relative paths in order.

**How to route new files (app-shell + Tailwind):**
- Add new always-on files (e.g. the app-shell component's four files, and if the
  shell replaces/wraps `hello-card`, adjust the page) as new `SCAFFOLD_FILES`
  entries — inline string constants, or thunks if they must read package metadata.
- Conditional Tailwind files (only when `--tailwind`) CANNOT be static
  `SCAFFOLD_FILES` entries because that constant is unconditional. Two code-shaped
  options for the plan to choose between (pick ONE, don't leave "X or Y"):
  - (a) Build the file list dynamically inside `scaffoldProject` (take a
    `{ tailwind?: boolean }` option; start from the base list, conditionally append
    Tailwind entries and swap `packageJson` for a Tailwind-aware thunk), then pass
    the assembled list to `writeFileSet`. Keeps the guard untouched.
  - (b) Keep SCAFFOLD_FILES as the base and compose an extra array for Tailwind,
    concatenated before `writeFileSet`.
  Either way, the conflict guard still runs over the FULL assembled list, so the
  no-partial-write contract is preserved. The existing test asserts
  `SCAFFOLD_FILES.map(f=>f.path)` equals the base 10-file list (init.test.ts), so
  keep SCAFFOLD_FILES as the base/no-flag set and layer Tailwind on top rather than
  mutating the constant.
- `packageJson()` is a thunk that reads `../package.json` from the CLI install to
  pin `{ [name]: version }` and `engines.node`. A Tailwind-aware package.json must
  similarly read the CLI's OWN pinned Tailwind versions (see §5), not hardcode.

---

## 4. Template-string escaping rules (embedded templates)

All templates are JS template literals in `src/scaffold.ts`. Escaping observed:
- Literal backticks inside a template literal are escaped as a backslash-backtick
  pair. Example in `README`: backslash-escaped `adx init`, `hello-card/`, and fenced
  code blocks written as backslash-escaped triple-backtick fences.
- `${...}` would be interpolation; current templates contain no stray `$` that needs
  escaping, but any literal `${` in new template content MUST be escaped as `\${`.
- ADX `{{var}}` interpolation inside `structure.adx` templates is NOT special to JS
  template literals (no `$`), so it is written literally (`{{title}}`).
- The TOKENS/PAGE/MANIFEST constants are plain JSON-as-string ending in a trailing
  newline; keep that trailing `\n` for byte-stability (a test compares the embedded
  tokens VERBATIM to `tokens/design-tokens.json`).

New embedded templates (app-shell files, Tailwind input CSS, site.json) must follow
the same rules: escape every literal backtick, escape any literal `${`, keep the
trailing newline, and keep JSON strings valid.

---

## 5. Pinned Tailwind version + how to read it (source of truth)

- Worktree `package.json` devDependencies pin **`@tailwindcss/cli`: `4.3.3`** and
  **`tailwindcss`: `4.3.3`** (exact, no caret). Confirmed. (Brief said "expected
  4.3.3" — matches.)
- This is the version the starter should REQUEST. Mirror `packageJson()`'s existing
  pattern: it reads the CLI's own `../package.json` via
  `fileURLToPath(new URL("../package.json", import.meta.url))` and uses
  `metadata.version`/`metadata.name`. A Tailwind-aware scaffold should read
  `metadata.devDependencies["tailwindcss"]` and
  `metadata.devDependencies["@tailwindcss/cli"]` from that SAME object and pin those
  exact strings into the generated app's devDependencies — never hardcode "4.3.3" in
  a string, so the starter tracks the CLI's pin automatically.
- Note: `packageJson()` currently validates only `name`/`version`/`engines.node`.
  If it must also surface Tailwind versions, extend the validation to assert those
  two devDependency keys exist (and throw the standard `[ADX]` file error if not),
  so a broken install still writes nothing.

---

## 6. Constraints / risks (must hold)

- **No npm, no network, ever.** `adx init` only writes files. `--tailwind` must only
  PIN versions + emit config files "ready to be installed" (per the user request);
  it must not spawn `npm install` or the Tailwind CLI. The README/next-steps text is
  where the manual `npm install` + Tailwind build commands belong.
- **Every prop must have a default.** `adx check`/`build` run with NO `--data` for
  the starter. The existing `hello-card` props all default; the app-shell component
  (and any new child) MUST default every prop (note `site-header`'s `siteName` is
  `required` — AVOID required props in the starter shell, or give them defaults), so
  a bare `adx check index.json` passes. init.test.ts enforces this by compiling the
  scaffolded component AND page with no data.
- **Conflict-safe, no partial write.** Any new files go through `writeFileSet` so the
  "refuses to overwrite, writes nothing on partial conflict" contract still holds
  across the FULL (base + Tailwind) set. The
  `it.each(["index.json","package.json",".gitignore","AGENTS.md"])` test in
  init.test.ts asserts this; a Tailwind run should get analogous coverage.
- **SEO/a11y heading baseline.** A page test asserts EXACTLY one `<h1>` and NO `<h2>`
  for the single-card starter. If the app-shell introduces a page header `<h1>`, the
  card title must be DEMOTED (the current `hello-card` structure comment already
  anticipates this: a multi-card page reserves the `<h1>` for a page header and
  demotes the card title). Plan must keep exactly one `<h1>` and no skipped levels,
  and UPDATE the two heading-count assertions in init.test.ts to match the new
  structure.
- **Token-only styling.** No hardcoded hex in `.adx.css`; use `@use tokens;` +
  `tokens.*`. A test asserts no leftover `tokens.` and verbatim token embedding.
- **Docs stay in sync (steering rule).** New `--tailwind` flag -> update
  `usage()`/`helpText()`/`COMMANDS` in `cli.ts`, the `adx init` doc comment, README,
  `docs/agent-reference.md`, and `docs/human-guide.md`. App-shell -> update the
  starter description in README/AGENTS.
- **CLI dispatch coupling.** `run()` for init is in a try/catch that turns `[ADX]`
  throws into stderr + exit 1. `runInit` currently reads only `args.dir`. The
  `ParsedArgs` objects in init.test.ts are built as LITERALS (no `tailwind` field);
  adding an optional `tailwind?: boolean` to `ParsedArgs` keeps those literals
  type-complete (mirror how `list?`/`dir2?` were added as optional).

---

## 7. CLI flag-parsing convention to mirror for `--tailwind`

`parseArgs(argv)` in `src/cli.ts`:
- Known value flags: `--out`, `--tokens`, `--data`, `--site` consume the NEXT token
  as a value (`rest[++i]`).
- **Command-gated boolean flags** are the precedent for `--tailwind`: `--list` is
  gated to `pattern` via `const isPattern = command === "pattern"` and matched as
  `else if (isPattern && arg === "--list") { parsed.list = true; }`. `--port`/`--host`
  are gated to `serve` the same way (`isServe`). For every OTHER command the flag
  stays an unknown `--` token and is skipped (so their arg handling is byte-for-byte
  unchanged).
- **Mirror for `--tailwind`:** add `const isInit = command === "init";` and
  `else if (isInit && arg === "--tailwind") { parsed.tailwind = true; }`. Add an
  OPTIONAL `tailwind?: boolean` to the `ParsedArgs` interface (like `list?`),
  defaulting to undefined/false. This is a boolean flag (no value token), matching
  `--list`.
- Positional handling is unchanged: the first non-`--` token is `dir` (the init
  `name`), the second is `dir2` (ignored by init).
- `runInit` would then read `args.tailwind` and pass `{ tailwind: args.tailwind }`
  into `scaffoldProject`. The clobber/`[ADX]` error path through `run()` is reused
  as is.

---

## 8. Test baseline

- Current total: **338 tests** (confirmed via `npx vitest list | grep -cE " > "`
  from the repo root; the worktree has no `node_modules` yet — deps live in the
  parent checkout, so run vitest from the parent or install in the worktree). Brief's
  "338" matches.
- Init/scaffold tests live in `test/init.test.ts` (two `describe` blocks:
  `scaffoldProject` unit tests + `adx init CLI dispatch`). Clobber-guard coverage:
  the unit `it.each([...])("refuses to overwrite %s and writes nothing")` and the CLI
  `"returns 1 with the [ADX] clobber error ..."`. New behavior (app-shell files,
  `--tailwind`) should extend THIS file with the same patterns (mkdtemp temp dir,
  compile the scaffold with the real compiler, assert no partial write).
- Verification commands for the plan: `npx vitest run test/init.test.ts` (fast,
  scoped) and `npm test` (full `vitest run`) for the whole suite; `npm run build`
  (`tsc -p tsconfig.json`) for type-check. These are the project's real commands
  from `package.json` scripts.

---

## 9. Ambiguities / gaps for the plan to resolve

1. **App-shell vs hello-card relationship.** User msg 3 asks for "a base component
   (root section for all the others)". Unresolved from code alone: should the shell
   WRAP `hello-card` via a default slot (page places shell -> shell slots in the
   card), or REPLACE the page->card wiring? Recommendation grounded in `landing`:
   shell is a parent component with a default slot; `index.json` places the shell and
   fills its slot with `hello-card`. The plan must pick the exact composition and
   keep the one-`<h1>` rule: either keep the card title the sole `<h1>` and give the
   shell a non-heading wrapper (no new test change needed), or move `<h1>` to the
   shell, demote the card title, and UPDATE the heading-count assertions. This is the
   single biggest decision; flag it explicitly.
2. **Exact Tailwind scaffold file set.** Docs show `styles/tailwind.css` +
   `site.json` + devDependency pins + README steps. The plan must decide the precise
   files `--tailwind` emits and whether it also rewrites the generated npm scripts to
   include a Tailwind build step (docs keep the Tailwind CLI call MANUAL via
   `npx @tailwindcss/cli ...`; safest is to document it, not script an auto-run).
3. **packageJson thunk shape under `--tailwind`.** Whether to emit one thunk that
   branches on the flag, or two thunks. Mirror the existing single-thunk pattern and
   branch inside.
4. **site.json as a scaffold file.** `--site` is build/check-only and not
   auto-discovered; emitting `site.json` is fine but the generated npm `build`/`check`
   scripts currently do NOT pass `--site`. Decide whether `--tailwind` updates those
   scripts to `adx build index.json --site site.json` (and same for check) so the
   starter's `npm run build` actually links Tailwind, or leaves it to the README. The
   former is more usable and matches the documented recipe; confirm in the plan.

No blockers. All core shapes (SCAFFOLD_FILES, writeFileSet guard, compose/slot
syntax, assets schema, flag gating, Tailwind pins, test baseline) were read directly
and are captured above.
