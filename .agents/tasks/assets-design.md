# Design — First-class, SEO-safe external CSS/JS design-library support for ADX pages

## Overview

Today an ADX page document has a fully hardcoded `<head>`: `wrapPageDocument`
(`src/page/compile.ts`) emits charset, viewport, `<title>`, description,
canonical, OG/Twitter, an optional JSON-LD block, and exactly one
`<link rel="stylesheet" href="style.css">`, then closes with one
`<script type="module" src="glue.js">` before `</body>`. There is no supported
way to reference an external stylesheet (e.g. Tailwind's compiled CSS) or an
external script. The only workaround an agent can reach for is hacking a runtime
`<script>` CDN tag into a *component's* structure — which breaks ADX's
static/crawlable/minimal-runtime-JS contract (it moves content/behavior into a
blocking third-party runtime and pollutes a reusable component with
page/document concerns).

This design adds a **generic `assets` mechanism at the page/document level**:
external CSS links, external/local JS scripts, and a raw `head` escape hatch,
declared on the page manifest and/or a **site-level config** that provides
defaults for every page, merged per-page. It is emitted by the single function
that owns the document — `wrapPageDocument` — so existing SEO metadata, the
token `style.css` link, and the hydration glue script are preserved
byte-for-byte when no assets are present. The blessed Tailwind path is
**build-time static CSS** (Tailwind CLI output referenced as an external
stylesheet); the compiler never runs Tailwind. External JS is allowed but the
docs warn that runtime-heavy scripts (e.g. the Tailwind Play CDN) undercut the
SEO/perf contract.

Scope is **pages only**. Standalone single-component builds (`compileComponent`
→ `wrapDocument` in `src/compile.ts`) are unchanged: they emit a minimal demo
document, and external assets belong at the page/document level.

## Technology stack (locked)

No new dependencies. TypeScript (ESM, NodeNext) compiled by `tsc`; Vitest for
tests; the existing `adxFileError` / `[ADX] <file> - <msg>` error convention;
the existing `escapeHtml` helper from `src/compile.ts` (already re-exported from
`src/index.ts`). JSON for both the page manifest and the new site config. No
runtime framework, no HTML templating library — string emission exactly as the
current wrapper does it.

**`serializeScriptJson` is deliberately NOT used by this feature.** It exists in
`src/compile.ts` and is consumed internally there (and in `wrapPageDocument`)
only for the JSON-LD block; it is *not* re-exported from `src/index.ts`. The
assets feature emits only `<link>` / `<script src>` / raw-`head` strings and
never serializes JSON, so it needs neither `serializeScriptJson` nor any new
export. If a future variant ever needed it, adding it to the `src/index.ts`
export block would be the prerequisite — but nothing in this design relies on
it.

## Page `assets` schema (locked)

A new **optional** `assets` object on the page manifest, mirrored by an optional
`assets` object on the site config (same shape). Shape:

```jsonc
{
  "assets": {
    "css": ["./tailwind.css", "https://cdn.example.com/lib.css"],
    "js": [
      { "src": "./app.js", "type": "module", "defer": true },
      "https://cdn.example.com/widget.js"
    ],
    "head": ["<meta name=\"theme-color\" content=\"#1d4ed8\">"]
  }
}
```

### `css` — external stylesheet links

- Type: array of non-empty strings. Each is a URL or a page-relative path.
- Emitted as `<link rel="stylesheet" href="<escaped>">` in `<head>`.
- The `href` **value is escaped** with `escapeHtml` (attribute-safe: `&`, `<`,
  `>`, `"`), so a normal URL/path passes through untouched while a stray quote
  cannot break out of the attribute.

### `js` — scripts

- Type: array; each item is **either** a non-empty string (shorthand for
  `{ src }`) **or** a plain object `{ src, type?, defer?, async? }`.
  - **Entry classification is pinned (locked), matching the real loader's own
    precedent.** In JavaScript `typeof [] === "object"` and
    `typeof null === "object"`, so a naive `typeof entry === "object"` check
    would let an **array** or **`null`** entry slip past the "is an object" gate
    and then fail on the missing-`src` rule with the *wrong* message — or throw
    a raw `TypeError` on `null` if `src` were read before a guard. The existing
    page loader avoids exactly this in `validateComponent`
    (`typeof value !== "object" || value === null || Array.isArray(value)`); the
    `js`-entry validator uses the **same** three-way branch, in this order:
    ```ts
    // per js entry `e` (file-labeled errors via adxFileError):
    if (typeof e === "string") {
      // shorthand: require length > 0 (see "non-empty" below), else
      //   `Each "assets.js" entry must have a string "src"` is NOT used here;
      // an empty-string shorthand takes the missing-src message (it normalizes
      // to { src: "" } which then fails the src rule) — see validation section.
    } else if (typeof e === "object" && e !== null && !Array.isArray(e)) {
      // object form: validate src/type/defer/async
    } else {
      // null, array, number, boolean, etc.
      throw adxFileError(file, `Each "assets.js" entry must be a string or an object with "src"`);
    }
    ```
    So `js: [null]`, `js: [[]]`, `js: [["x"]]`, `js: [42]`, `js: [true]` all take
    the **"must be a string or an object with \"src\""** message (NOT the
    missing-`src` message and never a `TypeError`). This branch order is part of
    the locked contract and is unit-tested per entry kind.
  - **"non-empty" is defined as `length > 0` with NO trimming**, matching the
    page loader's `requireString` (`value.length === 0` is the only rejection).
    So `"  "` (whitespace-only) is accepted verbatim and escaped like any other
    value — the loader does not trim, and neither does this validator.
  - `src` (required, non-empty string per the rule above) — URL or page-relative
    path; **escaped** as an attribute value.
  - `type` (optional string) — emitted verbatim as `type="<escaped>"` when
    present (the useful value is `"module"`; any string is allowed and escaped).
  - `defer` (optional boolean) — emits the boolean attribute `defer` when
    `true`, omits it otherwise.
  - `async` (optional boolean) — emits the boolean attribute `async` when
    `true`, omits it otherwise.
  - **Decision:** the field is named **`type`**, not a `module` boolean. Reason:
    `type="module"` is the real HTML attribute, it composes with other type
    values, and it keeps one obvious mapping (object key → attribute). The task
    brief floated both `type` and a `module` flag; we pick `type` and drop
    `module` so there is exactly one way to say it.
- **Golden serialized output (locked — the exact `<script>` text tests assert).**
  Attribute order is fixed: `type` (if present), then `src`, then `defer` (if
  `true`), then `async` (if `true`). Examples:
  - `"./widget.js"` (shorthand) -> `<script src="./widget.js"></script>`
  - `{ "src": "./app.js", "type": "module" }` -> `<script type="module" src="./app.js"></script>`
  - `{ "src": "./app.js", "type": "module", "defer": true }` -> `<script type="module" src="./app.js" defer></script>`
  - `{ "src": "./a.js", "type": "module", "defer": true, "async": true }` -> `<script type="module" src="./a.js" defer async></script>`
  - `{ "src": "./a.js", "async": true }` -> `<script src="./a.js" async></script>`
  `defer`/`async` are bare boolean attributes (no `="true"`); a `false`/absent
  flag emits nothing. These exact strings are the golden fixtures for the unit
  tests.
- **Placement (locked):** scripts are emitted **before `</body>`, after the
  hydration glue `<script type="module" src="glue.js">`**. Rationale: the glue
  is ADX's own hydration and must load first and uninterrupted; author scripts
  come after so they can assume hydrated DOM, and nothing an author adds can
  reorder or block ADX's own module. This keeps the SEO/perf contract (no
  blocking author script injected into `<head>`). The existing
  `seo-contract.test.ts` assertion that `src="glue.js"` sits after `</head>`
  continues to hold.

### `head` — raw escape hatch

- Type: array of strings. Each string is injected **verbatim** (NOT escaped)
  into `<head>`, **after** all managed metadata and after the managed CSS links
  (see ordering below).
- **Author-trusted:** page manifests and the site config are the author's own
  files, so `head` is a deliberate raw passthrough for tags ADX does not model
  (preload hints, `theme-color`, extra meta, a `<link rel="preconnect">`, etc.).
  Docs must state plainly: **raw, author-only, never feed untrusted input into
  `head`** — strings land in the document unescaped.

## Head/body ordering (locked)

`wrapPageDocument` emits, in `<head>`:

1. charset, viewport (unchanged)
2. `<title>` (unchanged)
3. `<meta name="description">` (unchanged)
4. `<link rel="canonical">` (unchanged)
5. OG/Twitter block (unchanged)
6. JSON-LD block, only when `page.schema` is present (unchanged)
7. `<link rel="stylesheet" href="style.css">` — **the ADX token stylesheet
   (unchanged position: still here, still first stylesheet)**
8. **external `assets.css` links**, in merged order
9. **raw `assets.head` strings**, verbatim, in merged order

Then `<body>` → `<main>` (unchanged) → `<script type="module" src="glue.js">`
(unchanged) → **external `assets.js` scripts**, in merged order → `</body>`.

**CSS order decision (locked): token `style.css` FIRST, external `assets.css`
AFTER.** Rationale: the user's explicit goal is "support Tailwind or whatever
css+js cross library for design." A design library is expected to be the
authoritative visual layer, so it must be able to override ADX's token-derived
component styles via normal cascade order (later wins at equal specificity).
Putting ADX tokens first and the library second gives the library the final say,
which is what "bring your own design system" means. (The alternative — library
first so ADX tokens always win — would make Tailwind utilities silently
ineffective against component styles and defeat the feature.) `head` comes after
the managed CSS so an author `<link>`/`<style>` in `head` can, if they choose,
sit after library CSS too.

## Site-level config + merge (locked)

### Form: `--site <path>` CLI flag, no implicit discovery

**Decision:** a shared site config is loaded only via an explicit
`adx build/check <page.json> --site <path>` flag. **No automatic `site.json`
discovery.** Rationale:

- Explicit is testable and has zero surprise: the page build's behavior is
  identical to today unless the author opts in. Implicit discovery walking up
  from the page dir would change existing fixture output depending on what files
  happen to sit nearby, risking the "byte-for-byte identical for existing
  fixtures" requirement and making builds environment-sensitive.
- It fits the existing CLI model: `--tokens`, `--out`, `--data` are all explicit
  path flags resolved against CWD. `--site` is one more of the same — its flag
  AND value token are **always consumed** by `parseArgs` (so the value can never
  leak into the positional `dir` for `serve`/`tokens`/`init`), but the value is
  **only stored** when the command is `build`/`check`. See implementation plan
  step 6 for the exact branch.
- Lowest friction for the one real workflow (a multi-page site shares one
  Tailwind build + one config): the author passes `--site site.json` on each
  page build, or a thin npm script loops the pages.

The config path is resolved against **CWD** (like `--tokens`), loaded and
validated by a new `loadSite(path)` (see below). Discovery-based auto-loading is
noted as a **future** enhancement, not built now.

### Site config file shape

```jsonc
// site.json (author-provided, passed via --site)
{
  "assets": {
    "css": ["./tailwind.css"],
    "js": [{ "src": "./site.js", "type": "module", "defer": true }],
    "head": ["<link rel=\"preconnect\" href=\"https://fonts.example\">"]
  },
  "lang": "en"
}
```

- `assets` — optional, exact same shape and validation as page `assets`.
- `lang` — optional string; a site-wide default `<html lang>` used when a page
  did **not explicitly** set `lang`. This is the one additional site-wide
  document default allowed; scope stays tight (no title/description/canonical at
  site level — those are inherently per-page). A page's **explicit** `lang`
  always wins over the site default; the site `lang` only fills in for a page
  that omitted `lang` (which otherwise falls back to the `"en"` default). See
  the locked `lang` rule below.
- Any other top-level key is ignored for now (forward-compatible), but unknown
  types on the known keys are validated and rejected.

### Merge + dedupe rule (locked)

Site `assets` are the **base**; page `assets` are **appended** (concatenate:
site first, then page), per field:

- `css`: `[...site.css, ...page.css]`, then **dedupe by exact string** keeping
  first occurrence (so a lib listed at both levels links once, site-ordered).
- `js`: `[...site.js, ...page.js]` normalized to objects, then **dedupe by
  `src`** (exact string) keeping first occurrence. If the same `src` appears
  with different flags, the first wins (site over page); this is acceptable
  because a script should load once and its site-level flags are the shared
  intent. Documented explicitly.
- `head`: `[...site.head, ...page.head]`, **no dedupe** (raw strings; an author
  repeating one is their choice, and equality is ambiguous for arbitrary
  markup).

**`lang` (locked, final rule):** `parsePage` keeps
`lang = optionalString(obj, "lang", file) ?? "en"` **unchanged** — the
standalone/no-site path and every existing `<html lang="en">` assertion in
`page-compile.test.ts` stay exactly as they are. `parsePage` **additionally**
sets `manifest.langExplicit = true` iff the parsed JSON contained a **string**
`lang` key (absent/omitted otherwise). That single internal boolean is the only
addition `lang` requires; it is used solely by the merge and is never emitted.

`compilePage` then computes:

```ts
const effectiveLang = page.langExplicit ? page.lang : (site?.lang ?? page.lang);
```

Because the loader already defaulted `page.lang` to `"en"`, `page.lang` is the
safe final fallback: with no site config, or a site config that omits `lang`,
`effectiveLang` is just `page.lang` (so a page that did not set `lang` and no
site default stays `"en"`). A site `lang` wins only when the page did **not**
explicitly set one. The resolved `effectiveLang` is passed into
`wrapPageDocument` via `{ ...page, lang: effectiveLang }`.

Concat+dedupe is the committed semantics; **replace semantics** (a page clearing
or overriding inherited assets) is noted as **future**, not built.

## Validation (locked)

All new validation lives next to the existing page validator and uses
`adxFileError(file, msg)` so messages read `[ADX] <file> - <msg>`. The `<file>`
is the page path for page `assets`, and the site config path for site `assets`.

A shared `validateAssets(value, file)` validates an `assets` object for both the
page loader and the site loader (single source of truth), returning a normalized
`PageAssets` (js shorthand strings expanded to `{ src }`). Rules and exact
messages (page example file `index.json`):

- `assets` present but not a plain object →
  `[ADX] index.json - "assets" must be an object`
- `assets.css` present but not an array of non-empty strings →
  `[ADX] index.json - "assets.css" must be an array of strings`
- `assets.js` present but not an array →
  `[ADX] index.json - "assets.js" must be an array of scripts`
- a `js` entry that is neither a non-empty string nor a plain object (i.e.
  `null`, an array, a number, a boolean, or an empty string) →
  `[ADX] index.json - Each "assets.js" entry must be a string or an object with "src"`.
  **This is checked with the pinned three-way guard** (`typeof === "string"`
  first; then `typeof === "object" && !== null && !Array.isArray`; else this
  message) so `null`/array/number/boolean entries deterministically take *this*
  message — never a `TypeError` and never the missing-`src` message below.
- a `js` **object** (passed the plain-object gate) missing a non-empty string
  `src` →
  `[ADX] index.json - Each "assets.js" entry must have a string "src"`.
  This message is reachable **only** from the object branch (e.g.
  `{ "type": "module" }` with no `src`, or `{ "src": "" }`). An array/`null`
  entry can never reach it because the guard above diverts them first.
- a `js` object `type` present but not a string →
  `[ADX] index.json - "assets.js" type must be a string`
- a `js` object `defer`/`async` present but not a boolean →
  `[ADX] index.json - "assets.js" defer must be a boolean` (and `… async must be a boolean`)
- `assets.head` present but not an array of strings →
  `[ADX] index.json - "assets.head" must be an array of strings`

Unknown keys inside `assets` are ignored (forward-compatible), matching the
loader's current tolerance for extra top-level page keys. The site loader adds:

- site config unreadable → `[ADX] <site> - Cannot read site config`
- site config invalid JSON → `[ADX] <site> - Invalid JSON`
- site config not a plain object → `[ADX] <site> - Site config must be an object`
- `lang` present but not a string → `[ADX] <site> - Field "lang" must be a string`
  (reusing the page loader's `optionalString` style/message).

Empty/absent `assets` (or an `assets` with all-empty arrays) must produce the
**exact current document output** — this is asserted against the existing
fixtures.

## Emission correctness (locked)

`wrapPageDocument` gains a second parameter carrying the **already-merged**
`PageAssets` (so the function stays pure and testable; merging happens in
`compilePage`). Signature:

```ts
export function wrapPageDocument(
  bodies: string[],
  page: PageManifest,
  assets?: PageAssets,   // merged site+page assets; omitted/empty = today's output
): string
```

The existing document body is unchanged; the token `style.css` link keeps its
**exact existing text and position** (`  <link rel="stylesheet" href="style.css" />`
as the last line of `<head>`) and the glue script keeps its exact existing text
and position (`  <script type="module" src="glue.js"></script>` as the last line
before `</body>`). New lines are spliced in at fixed seams with **pinned**
fragments so the "assert exact tag text" tests are deterministic. Each fragment
below begins with a leading `\n` and a two-space indent (matching the
surrounding `<head>`/pre-`</body>` indentation); the leading `\n` + fragments are
concatenated and inserted **only when the corresponding array is non-empty** (an
empty array contributes the empty string, so nothing is spliced).

- **CSS links** — one per `assets.css` entry, each exactly:
  ```
  \n  <link rel="stylesheet" href="${escapeHtml(href)}" />
  ```
  Concatenated (no separator between entries since each carries its own leading
  `\n`) and inserted **immediately after** the `style.css` line, **before**
  `</head>`. Self-closing with ` />` to match the existing `style.css` line
  exactly.
- **Raw head** — one per `assets.head` entry, each exactly:
  ```
  \n  ${raw}
  ```
  Inserted **after** the CSS links block and before `</head>`. **"Verbatim"
  means the string content (`${raw}`) is emitted unescaped**; the leading `\n  `
  is layout indentation only (it is NOT part of the author's string and does not
  make the content "non-verbatim"). An author who wants different indentation
  controls only the content, not the two-space prefix.
- **JS scripts** — one per merged `assets.js` entry, each exactly:
  ```
  \n  <script[ type="${escapeHtml(type)}"] src="${escapeHtml(src)}"[ defer][ async]></script>
  ```
  where bracketed parts appear only when present/true, in the fixed order given
  by the golden examples above. Inserted on their own lines **after** the glue
  `<script>` line and **before** `</body>`, only when `assets.js` is non-empty.
- When `assets` is undefined or every array is empty, **no extra lines are
  emitted** — the returned string is **byte-for-byte identical** to today's for
  the existing fixtures. This is the critical invariant: verified by the
  existing `page-compile.test.ts` / `seo-contract.test.ts` expectations plus a
  new "no-assets output unchanged" assertion.
- Zero `{{` in output is preserved (assets contribute only literal strings and
  escaped values). HTML stays well-formed: `<link>`/`<script>` are placed in
  valid positions (links/meta in `<head>`, scripts at end of `<body>`).

`compilePage` performs the merge: load the page, load the site config when
`--site` was passed (threaded via `CompilePageOptions.sitePath`), compute the
merged `PageAssets` and effective `lang`, then call `wrapPageDocument(bodies,
{ ...page, lang: effectiveLang }, mergedAssets)`.

## Error handling (concrete, per operation)

- **Read site config (`loadSite`)** — fs read throws → fatal
  `[ADX] <site> - Cannot read site config`; caller (CLI) prints to stderr, exit
  1. Not recoverable (the author explicitly asked for this file). Logged only as
  the standard CLI stderr line.
- **Parse site JSON** — `JSON.parse` throws → fatal `[ADX] <site> - Invalid JSON`.
- **Validate site/page `assets`** — any rule above → fatal `adxFileError` with
  the exact message; thrown synchronously from the loader, surfaced by the
  existing CLI `try/catch` in `run()`/`runPage` as stderr + exit 1. Not
  recoverable; the build cannot proceed with a malformed schema.
- **Emission** — `wrapPageDocument` cannot fail on valid merged input (pure
  string building). No new failure modes introduced; it never performs I/O.
- **Merge/dedupe** — total function on validated input; cannot throw.
- **Missing `--site` value** (flag present, no following token) — `parseArgs`
  consumes the (absent) value token (`rest[++i]` yields `undefined`) and, for
  build/check, stores `site = undefined`; `runPage` then leaves `opts.sitePath`
  unset, so the build proceeds as "no site config" (same as not passing the
  flag). Matches how `--tokens`/`--data` tolerate a trailing flag. No new error
  path. (Documented so it is intentional, not silent breakage.)

External asset *reachability* is **not** validated: `assets.css`/`assets.js`
entries may point at files that do not exist yet (e.g. a Tailwind build run
after `adx build`) or at remote URLs. The compiler only references them; it does
not fetch, read, or bundle them. This is stated in docs so authors know
`adx build` will not warn about a missing `./tailwind.css`.

## Input validation summary (per external input)

| Input | Required | Type | Limits | On failure |
|---|---|---|---|---|
| `assets` (page/site) | optional | object | unknown keys ignored | fatal `[ADX]` |
| `assets.css[]` | optional | non-empty string | URL/path, escaped as attr | fatal `[ADX]` |
| `assets.js[]` | optional | non-empty string OR `{src,...}` | — | fatal `[ADX]` |
| `js.src` | required (in object) | non-empty string | escaped as attr | fatal `[ADX]` |
| `js.type` | optional | string | escaped as attr | fatal `[ADX]` |
| `js.defer`/`js.async` | optional | boolean | — | fatal `[ADX]` |
| `assets.head[]` | optional | string | raw, unescaped, author-trusted | fatal `[ADX]` |
| site `lang` | optional | string | — | fatal `[ADX]` |
| `--site <path>` | optional | path string | resolved vs CWD | missing value → treated as unset |

## Invariant ownership

- **"No assets ⇒ byte-identical document":** owned by `wrapPageDocument`
  (guards each insertion on non-empty arrays). Enforced here because it is the
  only emitter of the document; tested against fixtures.
- **Attribute-safety of href/src/type:** owned by `wrapPageDocument` via
  `escapeHtml` at emission (not at validation), so the stored value stays the
  author's literal string and escaping is a pure output concern.
- **Raw-passthrough of `head`:** owned by `wrapPageDocument` (deliberately not
  escaped) and by docs (author-trusted contract).
- **Schema validity:** owned by the loaders (`load.ts` for page, new
  `site.ts`/`loadSite` for site) — the single place that converts untrusted JSON
  to typed `PageAssets`. Emission trusts its input.
- **Merge/dedupe determinism:** owned by `compilePage` (one merge step before
  wrapping), so both `compilePage` and `checkPage` (which calls `compilePage`)
  see identical merged assets.

## Testability

- **Unit (pure, no fs):**
  - `wrapPageDocument` with: no assets (identical to a golden string / existing
    fixture output), css-only, js-only (string + object forms, each flag),
    head-only, and all three together — asserting exact tag text, escaping of a
    quote-bearing href/src, and ordering (token `style.css` before external css;
    glue script before author js).
  - `validateAssets` for every error message above (page file label),
    **including the pinned `js`-entry classification**: `js: [null]`, `js: [[]]`,
    `js: [["x"]]`, `js: [42]`, and `js: [true]` must each throw the
    `Each "assets.js" entry must be a string or an object with "src"` message
    (NOT the missing-`src` message and NOT a `TypeError`); `js: [""]` and
    `js: [{ "type": "module" }]` (object, no `src`) must throw the missing-`src`
    message. These assert the branch order, not just that *an* error is thrown.
  - The merge+dedupe function: site-only, page-only, both with an overlapping
    css href and js src (dedupe keeps first), head concatenation (no dedupe),
    and `lang` precedence (page explicit wins, else site, else `"en"`).
- **Integration (fs/CLI):**
  - `parsePage` accepts a manifest with `assets` and rejects each malformed
    shape (extend `page-load.test.ts`).
  - `loadSite` reads/validates a temp `site.json`; unreadable/invalid-JSON/bad
    types.
  - `compilePage(page, { sitePath })` end-to-end: merged links/scripts appear in
    the emitted `index.html`; a page with no assets and no `--site` yields output
    equal to a **stored golden** captured from the pre-change build (an inline
    string / `toMatchInlineSnapshot` literal frozen at the pre-feature bytes),
    NOT a live re-compile compared to itself — so a stray wrapper edit is caught.
    Added to `page-compile.test.ts` for both `index.json` and `about.json`.
  - `parseArgs` test: `--site path` populates `sitePath` only for build/check,
    does not leak into serve/tokens/init, does not disturb `--port`/`--host`
    gating or `isEntryPoint()`.
  - SEO contract: new assets do not introduce `{{`, keep `src="glue.js"` after
    `</head>`, and a `head` string is emitted verbatim while an href with a
    quote is escaped (extend `seo-contract.test.ts`). The existing assertion
    only checks `glue.js` is after `</head>`; **add** an explicit
    `html.indexOf('src="glue.js"') < html.indexOf(authorSrc)` assertion so a
    future refactor cannot silently emit author js before the glue (the locked
    "author js after glue" contract).

A design concern worth noting: `wrapPageDocument` is already exported and unit
-tested directly (`seo-contract.test.ts`), so adding the optional third param
keeps it the natural seam — no hard-to-test wiring is introduced.

## Implementation plan — concrete touchpoints

1. **`src/page/types.ts`**
   - Add `PageAssetScript = { src: string; type?: string; defer?: boolean; async?: boolean }`.
   - Add `PageAssets = { css: string[]; js: PageAssetScript[]; head: string[] }`
     (normalized: arrays always present, js always objects).
   - Add optional `assets?: PageAssets` and internal `langExplicit?: boolean` to
     `PageManifest`.
   - Add `SiteConfig = { assets?: PageAssets; lang?: string }`.

2. **`src/page/load.ts`**
   - Add `validateAssets(value, file): PageAssets | undefined` (shared) with the
     exact messages above; normalize js shorthand strings to `{ src }`.
   - In `parsePage`: parse `obj.assets` via `validateAssets`; set
     `manifest.assets` when present; set `langExplicit` when the JSON had a
     string `lang`.

3. **New `src/page/site.ts`** (`loadSite(path): SiteConfig`, `parseSite(raw, file)`)
   - Read/parse/validate; reuse `validateAssets` and `optionalString`-style
     `lang` validation; messages labeled with the site path. Export both.

4. **`src/page/compile.ts`**
   - Extend `CompilePageOptions` with `sitePath?: string`.
   - In `compilePage`: when `sitePath` set, `loadSite` it; compute merged
     `PageAssets` (concat + dedupe) and effective `lang`; pass both into
     `wrapPageDocument`.
   - `checkPage` is **unchanged in signature** — it already delegates to
     `compilePage(pageManifestPath, opts)` with the same `CompilePageOptions`,
     so threading `sitePath` through `opts` makes check and build merge site
     assets identically with no extra wiring. (This is why `runPage` must set
     `opts.sitePath` before the check/build split — see step 6.)
   - Add a `mergeAssets(site, page): PageAssets` helper (pure, exported for
     unit tests) and a small `dedupeBy`/string-dedupe util.
   - Extend `wrapPageDocument(bodies, page, assets?)` to emit css links, raw
     head, and js scripts per the ordering above, each guarded on non-empty.

5. **`src/index.ts`**
   - Export `loadSite`, `parseSite`, `mergeAssets`; export types `PageAssets`,
     `PageAssetScript`, `SiteConfig`.

6. **`src/cli.ts`**
   - `ParsedArgs`: add `site: string | undefined` (matching the existing
     optional-flag fields like `tokens`/`data`). Add `site: undefined` to the
     `parseArgs` initializer literal.
   - `parseArgs` (**value-token consumption is unconditional; storage is gated**):
     add a branch that **always consumes both the `--site` flag token AND its
     value token** (`rest[++i]`) whenever `--site` appears, regardless of
     command, but **only stores** the value when the command is build/check:
     ```ts
     } else if (arg === "--site") {
       const value = rest[++i];            // always consume the value token
       if (command === "build" || command === "check") {
         parsed.site = value;              // only honored for build/check
       }
     }
     ```
     This is the critical fix from the review: if the value token were not
     consumed for `serve`/`tokens`/`init`, it would be a bare word captured by
     the positional branch (`!arg.startsWith("--") && dir === undefined`) as
     `dir` — e.g. `adx serve dist --site foo.json` would wrongly capture
     `foo.json`, and `adx tokens --site foo.json` would set a stray `dir`. By
     consuming the value unconditionally and only storing it for build/check,
     `--site` can never bleed into `dir` for any command. This branch is placed
     among the always-consumed path flags (`--tokens`/`--data`/`--out`); it
     **does not** touch the `isServe`-gated `--port`/`--host` handling, the
     positional-capture branch, or `isEntryPoint()`.
   - `runPage`: set `opts.sitePath = resolve(args.site)` (when `args.site` is
     set) **before** the `command === "check"` branch, since `runPage` builds
     `opts` once and both branches reuse it. This guarantees `adx check
     page.json --site site.json` and `adx build page.json --site site.json`
     merge site assets identically (`checkPage` delegates to `compilePage`, both
     take `CompilePageOptions`).
   - Update the top-of-file command doc comment, `usage()` lines for build/check,
     `COMMANDS` invocations for build/check, and `helpText()` (auto from
     `COMMANDS`). Keep `usage()` otherwise byte-identical.
   - **Test helper note:** `test/cli-commands.test.ts`'s `argsFor()` spreads a
     fully-populated `ParsedArgs` literal; its base object must add
     `site: undefined` or the file will not compile once the field exists.

7. **Fixtures** (`fixtures/site/` **already exists** — it holds `index.json`,
   `about.json`, and `site-header/`, and is consumed by `page-compile.test.ts`
   and `seo-contract.test.ts` via `helpers.siteDir`, with exact-output
   assertions on title/description/canonical/lang/JSON-LD).
   - **Leave `index.json`, `about.json`, and `site-header/` untouched** — their
     emitted output must stay byte-for-byte identical.
   - **Add** to the existing directory: a `site.json` (with a Tailwind
     `assets.css` entry, e.g. `"./tailwind.css"`, and perhaps a site `js`/`head`
     default), a new `styled.json` page that declares its own per-page
     `assets` (css + a js object + a head string) to demonstrate the merge, and
     a small `fixtures/site/tailwind.css` placeholder the config references.
   - The new `site.json` is **not auto-discovered** (there is no discovery), so
     the existing `compilePage(join(siteDir, "index.json"), opts)` calls — which
     pass no `sitePath` — are unaffected by its mere presence.
   - **Byte-identity regression guard = a STORED golden, not a live
     self-comparison (locked).** A self-comparison (`compilePage(...) ===
     compilePage(...)` within one run, or comparing today's build to itself
     after merely adding an un-discovered `site.json`) is tautological — it
     passes even if a wrapper edit introduced a stray `\n`, because both sides
     run the same post-change code. Instead, **capture the current
     `compilePage(join(siteDir, "index.json"), opts).html` string as a committed
     inline literal** (an exact `const EXPECTED_INDEX_HTML = \`…\`` in
     `page-compile.test.ts`, or a Vitest `toMatchInlineSnapshot`) taken from the
     *pre-change* build, and assert the post-change build **equals that
     literal**. Because the golden is frozen at its pre-feature bytes, any
     accidental wrapper change (extra newline, moved line, altered indentation)
     fails the assertion. Do the same for `about.json` (which exercises an
     explicit `canonical` + `schema`). This stored-golden assertion — not a live
     recompile — is the real defense of the "no assets ⇒ byte-identical
     document" invariant against the pre-existing fixtures.

8. **Tests** — `test/page-load.test.ts`, `test/page-compile.test.ts`,
   `test/seo-contract.test.ts`, plus a new `test/site-config.test.ts` and
   `parseArgs` additions in the CLI test file; cover the unit + integration list
   above.

9. **Docs sync (HARD RULE — same change)**
   - `docs/agent-reference.md` (Pages section): add the `assets` field table,
     the `--site` flag, the merge/dedupe rule, the CSS-order rule, and the
     Tailwind-CLI "recommended" note with the SEO warning about runtime CDN JS.
   - `docs/adx-grammar.md`: document the page-manifest/site-config `assets`
     schema (it is JSON, but the grammar/reference pair must stay in sync per the
     documentation steering).
   - `docs/human-guide.md`: add a worked "use Tailwind with ADX" section — run
     the Tailwind CLI to produce `tailwind.css`, reference it via `site.json`
     `assets.css`, build with `--site site.json`; explain why build-time CSS is
     preferred over the Play CDN.
   - `docs/architecture.md` (SEO contract): note that external CSS is SEO-safe,
     external JS is allowed but author-owned and warned against for runtime-heavy
     libs, and that assets never move content out of the static HTML.
   - `docs/roadmap.md`: add a shipped row for first-class page assets + site
     config; note replace-semantics and site-config auto-discovery as future.
   - `README.md`: keep status/feature list accurate (mention Tailwind/CSS-library
     support via page assets).

## Out of scope / future (documented)

- **Replace/override merge semantics** (a page clearing inherited assets) —
  future; concat+dedupe only now.
- **Site-config auto-discovery** (implicit `site.json` lookup) — future; only
  explicit `--site` now.
- **Running Tailwind** (or any CSS/JS toolchain) from the compiler — never; ADX
  references the generated CSS, the author runs their toolchain.
- **Asset existence/URL reachability checks** — not performed.
- **Per-component assets** and **standalone-build assets** — out of scope;
  assets are a page/document concern.
- **Preload/priority hints as first-class fields** — authors use the raw `head`
  escape hatch for now.

## Responses to design review — round 2 (assets-design-review.md, verdict CHANGES_REQUESTED: 0 HIGH / 1 MEDIUM / 2 NIT)

The second-round review re-derived every load-bearing claim from source and
confirmed the design is accurate on the high-risk invariants (byte-identity,
`--site` token consumption, the `wrapPageDocument` seam, error format, `lang`
precedence). Three residual findings remain; **all three are addressed** in this
revision (none backlogged or ignored). They align with the original approved
scope — each sharpens specification/testing without changing any locked
decision.

- **Finding 1 (MEDIUM — `js` entry classification for `null`/array is
  unspecified; risks the wrong message or a `TypeError`).** Addressed. The `js`
  schema section now pins a **three-way guard matching the real loader's
  `validateComponent`**: `typeof e === "string"` → shorthand; else
  `typeof e === "object" && e !== null && !Array.isArray(e)` → object form;
  else throw `Each "assets.js" entry must be a string or an object with "src"`.
  The validation section states explicitly that `null`/array/number/boolean
  entries take *that* message (never the missing-`src` message, never a
  `TypeError`), and the testability section adds unit cases for `js: [null]`,
  `js: [[]]`, `js: [["x"]]`, `js: [42]`, `js: [true]`, plus the object-form
  missing-`src` cases, asserting the exact message per entry kind.

- **Finding 2 (NIT — `serializeScriptJson` listed as a used helper but neither
  re-exported nor needed).** Addressed. The "Technology stack (locked)" section
  drops `serializeScriptJson` from the helper list and adds an explicit note:
  it is consumed only internally for JSON-LD, is **not** re-exported from
  `src/index.ts`, and the assets feature (which emits only link/script-src/raw
  strings) never serializes JSON, so it is not a dependency. If a future variant
  needed it, adding it to `src/index.ts` exports would be the prerequisite.

- **Finding 3 (NIT — byte-identity guard must use a stored golden, not a live
  self-comparison).** Addressed. Implementation plan step 7 and the integration
  testability bullet now require capturing the **pre-change**
  `compilePage(siteDir/index.json).html` (and `about.json`) as a committed
  inline literal / `toMatchInlineSnapshot`, and asserting the post-change build
  equals that frozen literal — so an accidental wrapper edit (stray `\n`, moved
  line, changed indentation) fails the test, which a tautological live
  self-comparison would miss.

### Responses to design review — round 1 (prior revision, verdict CHANGES_REQUESTED)

All eight round-1 findings were **addressed** in the prior revision and remain
addressed here; none backlogged or ignored.

- **Finding 1 (HIGH — `--site` value token leaks into `dir` for
  serve/tokens/init).** Addressed. The "Form" section and implementation plan
  step 6 now specify that `parseArgs` **always consumes both the `--site` flag
  and its value token** regardless of command, and **only stores** the value
  for build/check (`const value = rest[++i]; if (command === "build" || command
  === "check") parsed.site = value;`). This matches the review's exact fix and
  cannot bleed into the positional `dir` for any command. The error-handling
  "Missing `--site` value" bullet was rewritten to describe the new
  consume-then-conditionally-store behavior.

- **Finding 2 (HIGH — stale assumption that `fixtures/site/` is new).**
  Addressed. Implementation plan step 7 now states the directory **already
  exists** (`index.json`, `about.json`, `site-header/`, under test via
  `helpers.siteDir`), that `index.json`/`about.json`/`site-header/` stay
  **untouched**, and that the new `site.json` + `styled.json` + `tailwind.css`
  are **added**. It also adds the explicit regression assertion that
  `compilePage(siteDir/index.json)` output is unchanged by the new `site.json`'s
  presence (nothing passes `sitePath` for it; there is no discovery).

- **Finding 3 (MEDIUM — `sitePath` threading into `checkPage` via `runPage`).**
  Addressed. Step 6 now states `runPage` sets `opts.sitePath = resolve(args.site)`
  **before** the `command === "check"` branch, and step 4 restates that
  `checkPage` delegates to `compilePage` with the same `CompilePageOptions` so
  both merge identically. `CompilePageOptions` gains `sitePath?: string`
  (confirmed in step 4).

- **Finding 4 (MEDIUM — js golden string + "non-empty" definition).**
  Addressed. The `js` schema section adds a **Golden serialized output** block
  with pinned `<script>` strings (including `{src,type:"module",defer:true,
  async:true}` → `<script type="module" src="./a.js" defer async></script>`),
  and states **"non-empty" = `length > 0` with no trimming**, matching the page
  loader's `requireString`.

- **Finding 5 (MEDIUM — exact insertion indentation/newline shape).**
  Addressed. The Emission-correctness section now pins each fragment exactly:
  css = `\n  <link rel="stylesheet" href="${escapeHtml(href)}" />` per entry;
  head = `\n  ${raw}` per entry (verbatim = string content, `\n  ` is layout);
  js = `\n  <script …></script>` per entry; and it states the token `style.css`
  link and the glue script keep their exact existing text and position.

- **Finding 6 (MEDIUM — self-contradicting `lang` paragraph).** Addressed. The
  paragraph was replaced with the clean final rule: `parsePage` keeps
  `lang = optionalString(...) ?? "en"` unchanged and additionally sets
  `langExplicit = true` iff the JSON had a string `lang`; `compilePage` computes
  `effectiveLang = page.langExplicit ? page.lang : (site?.lang ?? page.lang)`.

- **Finding 7 (NIT — `argsFor` hard-codes `ParsedArgs`).** Addressed. Step 6
  now notes `argsFor`'s base object must add `site: undefined` and that
  `ParsedArgs` types `site` as `string | undefined`.

- **Finding 8 (NIT — js-after-glue needs its own assertion).** Addressed. The
  SEO-contract testability bullet now adds an explicit
  `indexOf('src="glue.js"') < indexOf(authorSrc)` assertion.
