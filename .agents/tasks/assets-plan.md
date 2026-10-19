# Implementation Plan — SEO-safe external CSS/JS assets for ADX pages

Derived from the APPROVED design (`.agents/tasks/assets-design.md`, review
`.agents/tasks/assets-design-review.md`, verdict APPROVED: 0 HIGH / 0 MEDIUM /
2 NIT). The two NITs (whitespace-only `css` href accepted like `js.src`;
empty-string `head` entry legal) are folded into the relevant items below.

Scope: pages only. No new dependencies. All work on branch `main`, no worktree.
Baseline is green (`npm run build`, `npm run lint`, `npm test` → 229 tests pass);
every item must keep it green and must preserve byte-for-byte output for
assets-free pages.

Key facts confirmed against source:
- `wrapPageDocument(bodies, page)` in `src/page/compile.ts` ends `<head>` with
  `  <link rel="stylesheet" href="style.css" />` and ends the body with
  `  <script type="module" src="glue.js"></script>` before `</body>`.
- `escapeHtml` (from `src/compile.ts`, re-exported by `src/index.ts`) escapes
  `& < > "` only — attribute-safe for double-quoted values.
- `adxFileError(file, msg)` → `[ADX] <file> - <msg>`.
- `requireString`/`optionalString` in `src/page/load.ts`: non-empty = `length > 0`
  with NO trimming; `optionalString` throws `Field "<field>" must be a string`.
- `validateComponent` uses the three-way guard
  `typeof v !== "object" || v === null || Array.isArray(v)` — the pinned
  precedent for the `js`-entry classifier.
- `checkPage(path, opts)` delegates to `compilePage(path, opts)` with the same
  `CompilePageOptions`; `compilePage` builds the doc via one
  `wrapPageDocument(bodies, page)` call.
- `fixtures/site/` already exists (`index.json`, `about.json`, `site-header/`);
  both pages set `lang: "en"` explicitly. Leave them untouched.
- CLI `parseArgs`: `--out`/`--tokens`/`--data` consumed unconditionally;
  `--port`/`--host` gated behind `isServe`; positional capture is
  `!arg.startsWith("--") && parsed.dir === undefined`. `ParsedArgs` optional
  flags are `T | undefined` (no `?`). `test/cli-commands.test.ts` `argsFor()`
  spreads a fully-populated base literal.

---

- [ ] 1. Add the asset/site types to `src/page/types.ts`.
      Add `PageAssetScript = { src: string; type?: string; defer?: boolean; async?: boolean }`;
      `PageAssets = { css: string[]; js: PageAssetScript[]; head: string[] }`
      (normalized form — arrays always present, js entries always objects);
      optional `assets?: PageAssets` and internal `langExplicit?: boolean` on
      `PageManifest`; and `SiteConfig = { assets?: PageAssets; lang?: string }`.
      Document `langExplicit` as loader-internal (set iff the JSON had a string
      `lang`), never emitted.
      Files: src/page/types.ts
      Verify: `npm run build` compiles with no type errors (no runtime behavior
      yet; types are consumed by later items).

- [ ] 2. Add the shared `validateAssets` validator to `src/page/load.ts` and wire it into `parsePage`.
      Add `export function validateAssets(value: unknown, file: string): PageAssets | undefined`
      returning `undefined` when `assets` is absent/undefined, else a normalized
      `PageAssets` (js shorthand strings expanded to `{ src }`). Rules + EXACT
      messages (file label is the caller's file):
      - `assets` present but not a plain object (use the three-way guard) →
        `"assets" must be an object`
      - `assets.css` not an array, or any entry not a `length > 0` string (NO
        trim, so `"  "` is accepted and kept verbatim) →
        `"assets.css" must be an array of strings`
      - `assets.js` present but not an array → `"assets.js" must be an array of scripts`
      - per js entry, PINNED three-way guard in this order:
        `typeof e === "string"` → shorthand, normalize to `{ src: e }` (an empty
        string normalizes to `{ src: "" }` and then fails the src rule below);
        else `typeof e === "object" && e !== null && !Array.isArray(e)` → object
        form; else throw
        `Each "assets.js" entry must be a string or an object with "src"`
        (so `null`/array/number/boolean take THIS message, never a `TypeError`,
        never the missing-src message).
      - js OBJECT missing a `length > 0` string `src` (reachable only from the
        object branch, e.g. `{ type: "module" }` or `{ src: "" }`) →
        `Each "assets.js" entry must have a string "src"`
      - js object `type` present but not a string → `"assets.js" type must be a string`
      - js object `defer` present but not a boolean → `"assets.js" defer must be a boolean`
      - js object `async` present but not a boolean → `"assets.js" async must be a boolean`
      - `assets.head` present but not an array of strings →
        `"assets.head" must be an array of strings` (empty-string entries ARE
        legal — `head` has no non-empty requirement; design NIT 2).
      Unknown keys inside `assets` are ignored (forward-compatible).
      In `parsePage`: call `validateAssets(obj.assets, file)`; set
      `manifest.assets` only when it returns a value; set
      `manifest.langExplicit = true` iff `typeof obj.lang === "string"` (keep the
      existing `lang = optionalString(...) ?? "en"` line unchanged).
      Files: src/page/load.ts
      Verify: `npx vitest run test/page-load.test.ts` still passes (new cases
      added in item 9); `npm run build` clean.

- [ ] 3. Add the site-config loader `src/page/site.ts`.
      New file exporting `parseSite(raw: string, file: string): SiteConfig` and
      `loadSite(path: string): SiteConfig`. `loadSite` reads the file (fs throw →
      `adxFileError(path, "Cannot read site config")`) then calls `parseSite`.
      `parseSite`: `JSON.parse` throw → `Invalid JSON`; not a plain object (the
      three-way guard) → `Site config must be an object`; validate `assets` by
      reusing `validateAssets(obj.assets, file)`; validate optional `lang` as a
      string (message `Field "lang" must be a string`, matching
      `optionalString`). Return `{ assets?, lang? }` with keys present only when
      provided. Import `validateAssets` from `./load.js`.
      Files: src/page/site.ts
      Verify: `npm run build` compiles; covered by tests in item 10.

- [ ] 4. Thread site assets through `compilePage` and emit them in `wrapPageDocument` (`src/page/compile.ts`).
      a) Extend `CompilePageOptions` with `sitePath?: string`.
      b) Add exported pure helper `mergeAssets(site: PageAssets | undefined, page: PageAssets | undefined): PageAssets`:
         `css = dedupe([...site.css, ...page.css])` by exact string, first wins;
         `js = [...site.js, ...page.js]` deduped by `src` (exact), first wins;
         `head = [...site.head, ...page.head]` with NO dedupe. Treat a missing
         side as empty arrays; always return the normalized `{ css, js, head }`.
      c) In `compilePage`: when `opts.sitePath` is set, `loadSite(resolve(opts.sitePath))`
         (resolve vs CWD, matching `--tokens`); compute
         `merged = mergeAssets(site?.assets, page.assets)` and
         `effectiveLang = page.langExplicit ? page.lang : (site?.lang ?? page.lang)`;
         call `wrapPageDocument(bodies, { ...page, lang: effectiveLang }, merged)`.
         When no site config, call `wrapPageDocument(bodies, page, page.assets)`
         (page.assets may be undefined). `checkPage` is unchanged — it delegates
         to `compilePage` so it picks this up for free.
      d) Extend the signature to
         `wrapPageDocument(bodies: string[], page: PageManifest, assets?: PageAssets): string`.
         Keep the existing document text byte-for-byte; splice new lines ONLY
         when the corresponding array is non-empty, at fixed seams:
         - CSS links: for each `assets.css` entry append
           `\n  <link rel="stylesheet" href="${escapeHtml(href)}" />`
           IMMEDIATELY AFTER the `style.css` line, before `</head>`.
         - Raw head: for each `assets.head` entry append `\n  ${raw}` (content
           unescaped — verbatim; the `\n  ` is layout only) AFTER the CSS links
           block, before `</head>`.
         - JS scripts: for each `assets.js` entry append
           `\n  <script[ type="${escapeHtml(type)}"] src="${escapeHtml(src)}"[ defer][ async]></script>`
           (bracketed parts only when present/true, in that fixed attribute
           order: type, src, defer, async; `defer`/`async` are bare boolean
           attributes) AFTER the glue `<script>` line, before `</body>`.
         When `assets` is undefined or every array empty, emit NOTHING extra —
         output is byte-for-byte identical to today.
      Files: src/page/compile.ts
      Verify: `npx vitest run test/page-compile.test.ts test/seo-contract.test.ts`
      still pass with the EXISTING assertions (no-regression); `npm run build` clean.
      New emission/merge assertions land in items 8–10.

- [ ] 5. Export the new symbols from `src/index.ts`.
      Add value exports `loadSite`, `parseSite` (from `./page/site.js`) and
      `mergeAssets` (from `./page/compile.js`); add type exports `PageAssets`,
      `PageAssetScript`, `SiteConfig` (from `./page/types.js`). Place beside the
      existing page exports. `validateAssets` need not be exported (internal to
      the loaders); do NOT add `serializeScriptJson` (unused by this feature).
      Files: src/index.ts
      Verify: `npm run build` clean; `npx vitest run` still green.

- [ ] 6. Add the `--site` flag to the CLI (`src/cli.ts`).
      a) `ParsedArgs`: add `site: string | undefined`; add `site: undefined` to
         the `parsed` initializer literal in `parseArgs`.
      b) In the `parseArgs` loop, among the always-consumed path flags
         (`--out`/`--tokens`/`--data`), add:
         ```ts
         } else if (arg === "--site") {
           const value = rest[++i];                 // ALWAYS consume value token
           if (command === "build" || command === "check") {
             parsed.site = value;                   // store only for build/check
           }
         }
         ```
         This must NOT touch the `isServe`-gated `--port`/`--host` branches, the
         positional-capture branch, or `isEntryPoint()`. Consuming the value
         unconditionally prevents it leaking into `dir` for serve/tokens/init.
      c) In `runPage`, before the `command === "check"` branch, set
         `if (args.site) opts.sitePath = resolve(args.site);` (opts is typed to
         allow `sitePath?: string`). Both check and build reuse the one `opts`.
      d) Update the usage/help surfaces to show `[--site <site.json>]` on the
         build and check invocations: the top-of-file command doc comment, the
         two `COMMANDS` build/check `invocation` strings, and the `usage()`
         build/check lines. `helpText()` derives from `COMMANDS` automatically.
         Keep every OTHER usage line byte-identical (init/serve/tokens/help).
         NOTE: `test/cli-commands.test.ts`'s `usage()` assertion pins the four
         legacy lines verbatim — update that expected literal in the SAME change
         (item 11) to match the new build/check lines.
      Files: src/cli.ts
      Verify: `npm run build` clean; `npx vitest run test/cli-commands.test.ts`
      passes after the test update in item 11.

- [ ] 7. Add asset fixtures under `fixtures/site/`.
      Leave `index.json`, `about.json`, `site-header/` UNTOUCHED (byte-identity).
      Add: `fixtures/site/tailwind.css` — a tiny committed static stub (a few
      real CSS rules in a comment-labeled "Tailwind CLI output" file; do NOT add
      Tailwind as a dependency or run its CLI); `fixtures/site/site.json` — a
      site config with `assets.css: ["./tailwind.css"]`, a site `js` object
      default (e.g. `{ "src": "./site.js", "type": "module", "defer": true }`),
      and a `head` entry (e.g. a `preconnect` link), optionally `lang`;
      `fixtures/site/styled.json` — a NEW page (slug e.g. `styled`) composing the
      existing `../user-card` (supply required `name` in `data`) and declaring
      its own `assets` (a css href, a js OBJECT with a quote-free src, and a
      `head` meta) to exercise site→page merge + dedupe (overlap at least one
      css href and/or js src with `site.json`). The new `site.json` is NOT
      auto-discovered, so existing `compilePage(join(siteDir, "index.json"))`
      calls are unaffected by its presence.
      Files: fixtures/site/tailwind.css, fixtures/site/site.json, fixtures/site/styled.json
      Verify: `node dist/cli.js check fixtures/site/styled.json --site fixtures/site/site.json`
      (after item 6 built) prints `OK` and exits 0.

- [ ] 8. Add `wrapPageDocument` + `mergeAssets` unit tests (extend `test/page-compile.test.ts`).
      Import `wrapPageDocument` and `mergeAssets`. Assert exact emitted tag text:
      no-assets (and empty-arrays) → identical to the current wrapper output
      (compare against a captured literal, see item 12); css-only (incl. a
      quote-bearing href escaped, and a whitespace-only `"  "` href accepted and
      escaped verbatim — design NIT 1); js-only covering each golden string
      (`"./widget.js"` → `<script src="./widget.js"></script>`;
      `{src,type:"module"}`; `{...,defer:true}`; `{...,defer:true,async:true}`;
      `{src,async:true}`); head-only (incl. `head: [""]` emitting only the
      indentation line — design NIT 2); all three together with correct ordering
      (token `style.css` BEFORE external css links; glue `<script>` BEFORE author
      js). Assert `mergeAssets`: site-only, page-only, overlapping css href +
      overlapping js src (dedupe keeps first/site), head concatenation with no
      dedupe, and lang precedence via `compilePage` (page explicit wins, else
      site, else `"en"`).
      Files: test/page-compile.test.ts
      Verify: `npx vitest run test/page-compile.test.ts` — all new + existing
      cases pass.

- [ ] 9. Add `validateAssets`/`parsePage` assets tests (extend `test/page-load.test.ts`).
      Valid: a manifest with full `assets` parses and normalizes js shorthand to
      `{ src }`. Each malformed shape throws its EXACT `[ADX] page.json - …`
      message from item 2, INCLUDING the pinned js-entry classification:
      `js: [null]`, `js: [[]]`, `js: [["x"]]`, `js: [42]`, `js: [true]` each →
      `Each "assets.js" entry must be a string or an object with "src"`; `js: [""]`
      and `js: [{ "type": "module" }]` each → `Each "assets.js" entry must have a
      string "src"`. Plus: `assets` not object, bad `css`, bad `js` array, bad
      `type`/`defer`/`async`, bad `head`; and the NIT edges `css: ["  "]`
      accepted, `head: [""]` accepted.
      Files: test/page-load.test.ts
      Verify: `npx vitest run test/page-load.test.ts` passes.

- [ ] 10. Add the site-config test suite `test/site-config.test.ts`.
      Cover `parseSite`: valid (assets + lang), not-object, invalid JSON, bad
      `lang` type, and that `assets` errors surface with the SITE file label.
      Cover `loadSite`: reads/validates a temp `site.json` (write to an mkdtemp
      dir, clean up in `afterEach`/`finally`); unreadable path →
      `[ADX] <path> - Cannot read site config`. Add an integration check:
      `compilePage(styledPageFixture, { tokensPath, sitePath: siteJsonFixture })`
      emits the merged external `<link>`/`<script>`/raw-head in the correct
      positions and preserves the token `style.css` link + glue script ordering,
      with zero `{{`.
      Files: test/site-config.test.ts
      Verify: `npx vitest run test/site-config.test.ts` passes; temp dirs cleaned.

- [ ] 11. Extend CLI + SEO-contract tests.
      `test/cli-commands.test.ts`: add `site: undefined` to the `argsFor()` base
      literal (required or the file won't compile); add `parseArgs` cases proving
      `--site path` sets `site` for build/check, does NOT set it (but still
      consumes the value, so `dir` is not polluted) for serve/tokens/init, and
      does not disturb `--port`/`--host` gating; and UPDATE the pinned `usage()`
      expected literal to the new build/check lines that include
      `[--site <site.json>]` (keep init/serve lines unchanged, and keep the
      "does not mention tokens/help" assertions).
      `test/seo-contract.test.ts`: add an assets case asserting no `{{` is
      introduced, `src="glue.js"` still sits after `</head>`, an author js src
      is emitted AFTER the glue
      (`html.indexOf('src="glue.js"') < html.indexOf(authorSrc)`), a `head`
      string is emitted verbatim, and a quote-bearing href is escaped.
      Files: test/cli-commands.test.ts, test/seo-contract.test.ts
      Verify: `npx vitest run test/cli-commands.test.ts test/seo-contract.test.ts` passes.

- [ ] 12. Add the stored-golden byte-identity regression guard (`test/page-compile.test.ts`).
      Before changing the wrapper (or by capturing from the pre-change build),
      freeze the current `compilePage(join(siteDir, "index.json"), opts).html`
      and `about.json` output as committed inline literals (a
      `const EXPECTED_INDEX_HTML = \`…\`` / `EXPECTED_ABOUT_HTML`, or
      `toMatchInlineSnapshot`). Assert the post-change build EQUALS the frozen
      literal — a stored golden, not a live self-comparison — so any stray
      newline/indentation/line-move in the wrapper fails. To capture the exact
      bytes, run a one-off script against the current build (or
      `toMatchInlineSnapshot` then run `vitest -u` once and inspect the diff is
      only the new literal). This is the real defense of the
      "no assets ⇒ byte-identical document" invariant.
      Files: test/page-compile.test.ts
      Verify: `npx vitest run test/page-compile.test.ts` — the golden assertions
      pass against the post-change wrapper.

- [ ] 13. Docs sync — agent reference + grammar (HARD RULE, same change).
      `docs/agent-reference.md` (Pages section): add the `assets` field table
      (`css` string[], `js` string|{src,type?,defer?,async?}[], `head` string[]),
      the `--site <path>` build/check flag, the site-config shape (`assets`,
      `lang`), the merge+dedupe rule (site base, page appended; css/js dedupe
      first-wins, head no dedupe), the CSS-order rule (token `style.css` first,
      external `assets.css` after so a design library can override via cascade),
      and an explicit AGENT RULE: for Tailwind/any CSS library use build-time
      static CSS via `assets.css` (author runs the Tailwind CLI; compiler never
      runs it), and do NOT inject a runtime CSS CDN `<script>` into a component —
      call out the old "put the Tailwind CDN in the Navbar" pattern as wrong and
      why (breaks the static/crawlable/minimal-JS contract, pollutes a reusable
      component with document concerns). Keep the agent-facing voice: compact,
      reference tables, short examples.
      `docs/adx-grammar.md`: document the formal page-manifest + site-config
      `assets` schema (types, required/optional, exact error messages) to stay in
      sync with the reference.
      Files: docs/agent-reference.md, docs/adx-grammar.md
      Verify: manual read-through — the `assets`/`--site`/merge/CSS-order/Tailwind
      rules are present and consistent with the code in items 1–6; no stale
      "not implemented" wording for shipped behavior.

- [ ] 14. Docs sync — human guide, architecture, roadmap, README (HARD RULE, same change).
      `docs/human-guide.md`: add a friendly "use Tailwind with ADX" walkthrough —
      run the Tailwind CLI to produce `tailwind.css`, reference it via `site.json`
      `assets.css`, build with `--site site.json`; explain why build-time static
      CSS beats the Play CDN (SEO/perf), with the CDN caveat.
      `docs/architecture.md`: note how external assets fit the SEO/static
      contract — external CSS is SEO-safe; external JS is allowed but author-owned
      and warned against for runtime-heavy libs; assets never move content out of
      the static HTML; pages-only; asset reachability is not validated.
      `docs/roadmap.md`: add a shipped row for first-class page assets + site
      config; list replace-semantics and site-config auto-discovery as future.
      `README.md`: keep status/feature list accurate (mention Tailwind/CSS-library
      support via page `assets`), honest 0.1.0-alpha voice. Also grep for any
      OTHER place documenting page-manifest fields and update it (search
      `docs/` + `README.md` for `"canonical"`, `"schema"`, `page manifest`,
      `components` field tables) — list what was found and updated.
      Files: docs/human-guide.md, docs/architecture.md, docs/roadmap.md, README.md
      Verify: manual read-through; `rg -n "assets|--site" docs README.md` shows
      the feature documented in each target and no contradictions remain.

- [ ] 15. Final full verification + end-to-end CLI check.
      Run `npm run build`, `npm run lint`, `npm test` — all green. Then exercise
      the BUILT CLI end-to-end:
      - `node dist/cli.js build fixtures/site/styled.json --site fixtures/site/site.json --out /tmp/adx-assets-test`
        → confirm `/tmp/adx-assets-test/styled/index.html` contains the merged
        external `<link rel="stylesheet" href="…tailwind.css" />`, the raw head
        snippet verbatim, and the external `<script src="…">` AFTER the glue
        script; the token `<link rel="stylesheet" href="style.css" />` and
        `<script type="module" src="glue.js">` are present and correctly ordered;
        SEO metadata (title/description/canonical/OG/Twitter) intact; zero `{{`.
      - No-regression: `node dist/cli.js build fixtures/site/index.json --out /tmp/adx-noassets-test`
        (no `--site`) and diff `index.html` against the same build captured
        before the feature (or against the item-12 golden) — must be identical.
      - Confirm arg parsing unchanged: `adx build`/`check`/`serve`/`init`/`tokens`/`help`
        behave as before (spot-check via the CLI test suite + a manual
        `node dist/cli.js help` and `node dist/cli.js serve fixtures` not
        capturing a stray `--site` value).
      Clean up `/tmp/adx-assets-test` and `/tmp/adx-noassets-test`.
      Files: none (verification only)
      Verify: all three npm scripts exit 0; the e2e HTML assertions above hold;
      the assets-free diff is empty.

---

## Implementation verification record (first iteration)

All items 1–15 implemented. No review file (`assets-review.json`) existed, so
this was a from-scratch implementation per the plan.

Commands run and results:
- `npm run build` → exit 0 (tsc clean, no type errors).
- `npm run lint` → exit 0 (eslint clean).
- `npx vitest run` → exit 0: **25 files, 266 tests passed** (baseline was 229;
  +37 new across page-load, page-compile, site-config, cli-commands,
  seo-contract).

End-to-end through the BUILT CLI
(`node dist/cli.js build fixtures/site/styled.json --site fixtures/site/site.json
--out /tmp/adx-assets-test`), on `styled/index.html`:
- (a) external `<link rel="stylesheet" href="./tailwind.css" />` present in
  `<head>`, after the token `style.css` link (deduped to one despite being in
  both site + page) → confirmed (count 1).
- (b) raw head meta `<meta name="theme-color" content="#1d4ed8" />` emitted
  verbatim, plus the site `<link rel="preconnect" ...>` → confirmed.
- (c) author `<script type="module" src="./styled.js" defer></script>` present,
  after the site `./site.js` script, both after the glue → confirmed; ordering
  `glue.js` index < author index → `true`.
- (d) token `<link rel="stylesheet" href="style.css" />` and
  `<script type="module" src="glue.js">` present and correctly ordered; SEO
  metadata (title/description/canonical/OG/Twitter/JSON-LD) intact → confirmed.
- (e) zero `{{` in output → confirmed (count 0).

No-regression: `node dist/cli.js build fixtures/site/index.json --out
/tmp/adx-noassets-test` → emitted HTML is **byte-for-byte identical** to the
pre-feature golden (asserted both via the stored-golden test and a direct string
compare: `IDENTICAL: true`); zero occurrences of `tailwind`/`styled.js`/
`theme-color` (no asset leakage into assets-free pages). CLI arg parsing
unchanged: `tokens --site foo.json` exits 0 (value consumed, not captured as
`dir`); `adx help` unchanged.

`/tmp/adx-assets-test` and `/tmp/adx-noassets-test` cleaned up; no hanging
processes (no `serve` was started).

NOT committed — a dedicated step commits after approval.

## Review-fix verification record (second iteration)
`assets-review.json` verdict was CHANGES_REQUESTED with 2 blocking findings, 1
info (no change required), 1 nit. All addressed:

1. BLOCKING "Tailwind output path misses the served URL" (gpt) — FIXED in
   `docs/human-guide.md`: the walkthrough now generates Tailwind to
   `dist/tailwind.css` and the shared site config declares a root-absolute
   `"/tailwind.css"` URL (page-only `./page-extra.css` kept as a page-relative
   example). Added an explicit "asset strings are browser URLs resolved relative
   to the emitted document, ADX never copies asset files" note to BOTH
   `docs/human-guide.md` and `docs/agent-reference.md`, naming the
   `<out>/index.html` vs `<out>/<slug>/index.html` emission paths.
2. BLOCKING "JavaScript src escaping lacks its required regression test" (gpt) —
   FIXED in `test/page-compile.test.ts`: added a direct `wrapPageDocument` case
   whose script `src` contains `&`, `"`, `<`, `>` AND a hostile `type`, asserting
   the exact escaped `type="…"` and `src="…"` attribute text. A future removal of
   `escapeHtml` from `scriptTag` now fails this test.
3. INFO "Raw head is unescaped (trust boundary)" (opus) — no change required
   (documented, intended, author-trusted escape hatch).
4. NIT "Docs cross-link anchor likely broken" (opus) — FIXED: simplified the
   agent-reference heading to `### External design-library assets` (clean,
   predictable GitHub slug `external-design-library-assets`) and updated both
   referring anchors in `README.md` and `docs/adx-grammar.md` to match. The
   `+`/`--site` detail moved into a parenthetical line below the heading.

Commands run and results (second iteration):
- `npm run build` → exit 0 (tsc clean).
- `npm run lint` → exit 0 (eslint clean).
- `npm test` (vitest run) → exit 0: **25 files, 267 tests passed** (266 + the new
  hostile-`src`/`type` escaping regression).
End-to-end through the BUILT CLI
(`node dist/cli.js build fixtures/site/styled.json --site fixtures/site/site.json
--out /tmp/adx-assets-test`), `styled/index.html`: (a) external stylesheet links
present in `<head>` after token `style.css`; (b) raw head meta/preconnect
verbatim; (c) author scripts (`./site.js`, `./styled.js`) after `glue.js` with
`type`/`defer`; (d) full SEO metadata + token `style.css` link + `glue.js`
module all present and ordered; (e) zero `{{` → all confirmed.
No-regression: `node dist/cli.js build fixtures/site/index.json --out
/tmp/adx-assets-test` → zero `{{`, no asset leakage
(`tailwind`/`page-extra`/`theme-color`/`preconnect` all absent); byte-identity
guarded by the stored-golden test (passing). `/tmp/adx-assets-test` cleaned up;
no hanging processes.
NOT committed — a dedicated step commits after approval.

## Review-fix verification record (third iteration)
`assets-review.json` verdict was CHANGES_REQUESTED: 2 blocking, 1 info (no change
required), 1 nit. All addressed:

1. BLOCKING "Hydration ordering promise is false" (gpt) — FIXED by narrowing the
   documented contract to a MARKUP-ORDER guarantee (behavior-preserving; emitted
   HTML unchanged). The claim that author scripts "may assume a hydrated DOM" was
   false for the supported forms (the glue is a deferred `type="module"` script,
   so a classic/shorthand author script runs before it and an `async` entry is
   unordered). Updated the `scriptTag` block comment in `src/page/compile.ts`,
   and the JS-order wording in `docs/agent-reference.md`, `docs/architecture.md`
   (emission sentence + "external JS" bullet), `docs/human-guide.md`, and
   `docs/roadmap.md`: author scripts are emitted in document order after the glue
   (nothing can precede it in the markup), but hydration-dependent code must wait
   for a readiness signal (`type:"module"`/`defer` or `DOMContentLoaded`). No
   enforced post-hydration scheduling (that would change emitted output and
   exceed approved scope); the behavior-preserving doc-narrowing option the
   finding offered was taken.
2. BLOCKING "Shared Tailwind example uses the wrong URL form" (gpt; opus nit) —
   FIXED. Changed the shared `--site` example in `docs/agent-reference.md` from
   `./tailwind.css` to a root-absolute `/tailwind.css` (with a one-line note that
   a shared asset uses a root-absolute URL and `./x.css` is reserved for a page's
   own co-located asset), the README `assets` example to `/tailwind.css`, and the
   shared Tailwind entry in BOTH `fixtures/site/site.json` and
   `fixtures/site/styled.json` to `/tailwind.css` (overlap preserved so the
   dedupe-to-one coverage still holds; `./page-extra.css` kept as the page-local
   example). Updated `test/site-config.test.ts` assertions to `/tailwind.css`.
3. INFO "Raw head is unescaped (trust boundary)" (opus) — no change required
   (documented, intended, author-trusted escape hatch).
4. NIT "Check-path site merge rests on delegation, not a direct test" (opus) —
   FIXED. Added a direct `checkPage(styled.json, { sitePath })` assertion to
   `test/site-config.test.ts` (does-not-throw), closing the merge-on-check gap.

Commands run and results (third iteration):
- `npm run build` → exit 0 (tsc clean).
- `npm run lint` → exit 0 (eslint clean).
- `npm test` (vitest run) → exit 0: **25 files, 268 tests passed** (267 + the new
  checkPage-merge assertion).
End-to-end through the BUILT CLI
(`node dist/cli.js build fixtures/site/styled.json --site fixtures/site/site.json
--out /tmp/adx-assets-test`), `styled/index.html`: (a) external
`<link rel="stylesheet" href="/tailwind.css" />` in `<head>` after token
`style.css`, deduped to exactly 1; `./page-extra.css` after it; (b) raw head
`preconnect` + `theme-color` meta verbatim; (c) author scripts
`type="module" src="./site.js" defer` then `./styled.js` after `glue.js`; (d) full
SEO metadata (title/description/canonical/OG/Twitter/JSON-LD) + token `style.css`
link + `glue.js` module all present and ordered; (e) zero `{{` → all confirmed.
No-regression: `node dist/cli.js build fixtures/site/index.json --out
/tmp/adx-noassets-test` → zero `{{`, no asset leakage
(`tailwind`/`page-extra`/`theme-color`/`preconnect`/`site.js`/`styled.js` all
absent); byte-identity guarded by the stored-golden test (passing).
`node dist/cli.js check fixtures/site/styled.json --site fixtures/site/site.json`
→ `OK`, exit 0. Cross-link anchors (`#external-design-library-assets`) in
`README.md` and `docs/adx-grammar.md` still match the agent-reference heading.
`/tmp/adx-assets-test` and `/tmp/adx-noassets-test` cleaned up; no hanging
processes (no `serve` started).
NOT committed — a dedicated step commits after approval.
