# First-class SEO-safe external CSS/JS assets for ADX pages

The change gives ADX pages a generic `assets` mechanism — external `css` links, `js` scripts, and a raw `head` escape hatch — declarable on a page manifest and/or a shared site config loaded via a new `--site <path>` build/check flag. All three asset kinds are emitted by `wrapPageDocument`, the single owner of the page document, so an assets-free page compiles byte-for-byte unchanged. The blessed Tailwind path is build-time static CSS referenced through `assets.css`; the compiler never runs Tailwind, and the docs steer agents away from the "Tailwind CDN in the Navbar" runtime-script hack that motivated the work. Scope is pages only; standalone component builds are untouched.

This is a follow-up pass over a diff revised three times. The two blocking findings from the prior consolidated review are both resolved in the current tree, and the earlier nits are closed too. I read the diff against the coder's recorded verification (build + lint clean, 268 tests passing per the third-iteration record in `assets-plan.md`) rather than re-running the suites, and found nothing that contradicts it.

Watch for: the raw `head` passthrough is emitted unescaped by design — correctly scoped to author-owned files and documented in agent-reference, architecture, and human-guide (confirmed, non-blocking info). This is the only standing observation; it is intended and does not require a change.

**Verdict**: APPROVED

## High-level view

Emission lives entirely in `wrapPageDocument`, which gained an optional third `assets` parameter. Each asset kind splices in at a fixed seam only when its array is non-empty, so an absent or all-empty `assets` contributes the empty string at every seam and the managed document (token `style.css` link, glue module script, every SEO tag) is produced with its exact prior bytes. That invariant is locked by a stored-golden `.toBe(...)` assertion against literals captured from the pre-feature build, not a live self-comparison.

Validation is centralized in one `validateAssets(value, file)` in `load.ts`, shared by both the page loader and the new site loader so page `assets` and site `assets` enforce identical rules and identical `[ADX] <file> - <msg>` strings, differing only in the file label. The `js`-entry classifier reuses the existing `validateComponent` three-way guard (string → shorthand; plain object → long form; everything else → one specific error), so `null`/array/number/boolean entries can never fall through to the missing-`src` message or throw a raw `TypeError`.

The site config is an explicit, opt-in surface: `--site` is loaded only when passed, with no filesystem discovery, so existing builds are unaffected by a `site.json` sitting nearby. The merge concatenates site-first then page, dedupes css by exact href and js by `src` (first/site wins, flags included), and leaves `head` un-deduped. A site-wide `lang` fills in only when a page did not explicitly set one, tracked by a loader-internal `langExplicit` flag that is never emitted.

The CLI threads `--site` without disturbing any other command: the flag's value token is always consumed (so it can never be captured as a positional `dir` for serve/tokens/init) but only stored for build/check, and the branch sits among the always-consumed path flags, ahead of the serve-only `--port`/`--host` gating, which stays untouched.

The third-iteration fixes all landed: the JS-ordering contract is narrowed to a markup-order guarantee (not a false "author scripts may assume a hydrated DOM" promise) in `scriptTag`'s comment and across agent-reference, architecture, human-guide, and roadmap; the shared Tailwind example is now a root-absolute `/tailwind.css` in agent-reference, README, and both `fixtures/site` files; and a direct `checkPage(styled, { sitePath })` assertion closes the previously-indirect merge-on-check gap.

<details>
<summary>Issues (1)</summary>

1. **Raw `head` is unescaped (trust boundary)** — `assets.head` strings are injected verbatim into `<head>`, including any `<script>`/`<style>` an author places there, which can bypass the "author JS after glue" and "no blocking head script" guarantees. Intended author-trusted escape hatch, documented in three places; keep it author-only and never wire untrusted input into it. No change required.

</details>

<details>
<summary>Details</summary>

### Emission seams and the byte-identity invariant

`wrapPageDocument` builds three fragments ahead of the template literal — `cssLinks`, `rawHead`, `jsScripts` — each mapping over a possibly-empty array where every produced line begins with its own `\n  `. An empty array yields `""`, so `...href="style.css" />${cssLinks}${rawHead}\n</head>` collapses to exactly the prior text, and likewise `...src="glue.js"></script>${jsScripts}\n</body>`. `compilePage` always passes a normalized `{ css: [], js: [], head: [] }` (from `mergeAssets`) even with no `--site` and no page assets, so the empty-array guards are what preserve the prior bytes.

```
<head>
  ... managed SEO metadata ...
  <link rel="stylesheet" href="style.css" />          <-- token stylesheet FIRST
  <link rel="stylesheet" href="<escaped assets.css>" />  <-- external CSS AFTER (cascade: lib wins)
  <raw assets.head verbatim>
</head>
<body>
  <main> ... </main>
  <script type="module" src="glue.js"></script>       <-- hydration glue FIRST
  <script ... src="<escaped assets.js>"></script>     <-- author JS AFTER (markup order only)
</body>
```

The regression guard is a genuine stored golden: `EXPECTED_INDEX_HTML` / `EXPECTED_ABOUT_HTML` are committed inline literals asserted with `.toBe(...)`, so a stray newline, moved line, or re-indentation of the managed template fails the test where a `compile === compile` check would pass. `scriptTag` fixes attribute order as `type`, `src`, `defer`, `async`, with `defer`/`async` as bare boolean attributes and `src`/`type` escaped; the five golden strings are asserted verbatim, and the CSS-before-external and glue-before-author orderings are asserted both by index comparison and by an explicit `indexOf('src="glue.js"') < indexOf(author)` assertion in `seo-contract.test.ts`.

### JS ordering is now a markup-order guarantee, not a runtime one

The prior gpt blocking finding was that the docs promised author scripts load after the hydration glue and may assume a hydrated DOM — false for the supported forms, since the glue is a deferred `type="module"` script while a shorthand/classic author script (normalized to `{ src }` with no `type`/`defer`) runs when the parser reaches it, before the deferred glue, and an `async` entry is unordered. The resolution taken is the behavior-preserving one the finding offered: the emitted HTML is unchanged, and the contract is narrowed to markup order everywhere it is stated. `scriptTag`'s block comment now says plainly that this is a markup-order guarantee and that hydration-dependent code must wait for a readiness signal (`type:"module"`/`defer` or `DOMContentLoaded`); agent-reference, architecture, human-guide, and roadmap carry the same narrowed wording. Enforcing post-hydration scheduling would have changed emitted output and exceeded approved scope, so narrowing the claim is the right call.

### Shared Tailwind URL form

The prior gpt blocking finding (opus nit) was that the canonical shared example used `./tailwind.css`, which for the non-root `styled` page resolves to `<out>/styled/tailwind.css` and 404s. The tree now uses a root-absolute `/tailwind.css` in the agent-reference shared example, the README example, and both `fixtures/site/site.json` and `fixtures/site/styled.json`, with the cross-page URL-resolution rule documented in agent-reference and human-guide (asset strings are browser URLs resolved against the emitted document; ADX never copies asset files; a shared asset uses a root-absolute URL emitted at `<out>/tailwind.css`). The `styled.json` fixture keeps `./page-extra.css` as the deliberate page-local example, which is correct for an asset that would sit beside that page's own `index.html`. The `/tailwind.css` overlap between site and page is preserved, so the dedupe-to-one integration assertion still has its coverage.

### Shared validation and the pinned `js`-entry guard

`validateAssets` is the single untrusted-JSON → `PageAssets` boundary, reused by `site.ts` so a malformed `assets` block produces the same message whether it sits on a page or a site config (only the file label differs — the site suite asserts `[ADX] site.json - ...`). The `js` classifier reproduces `validateComponent`'s `typeof e !== "object" || e === null || Array.isArray(e)` precedent, so `js: [null]`, `js: [[]]`, `js: [["x"]]`, `js: [42]`, `js: [true]` all take the "must be a string or an object with \"src\"" message, while `{ type: "module" }`, `""`, and `{ src: "" }` reach the missing-`src` message. Both branches are asserted per entry kind in `page-load.test.ts`. The two design NITs are honored: `css` rejects empty strings but accepts whitespace-only `"  "` with no trim, and `head` has no non-empty rule so `[""]` is legal and emits just the indentation line.

### Merge, dedupe, and `lang` precedence

`mergeAssets` concatenates site-first then page, dedupes `css` by exact string and `js` by `src` (first occurrence wins, carrying its flags), and leaves `head` un-deduped — a pure, total function on validated input, so `compilePage` and `checkPage` see identical output. The unit test exercises an overlapping css href and an overlapping js `src` with differing flags and confirms the site entry (flags included) survives. `effectiveLang = page.langExplicit ? page.lang : (site?.lang ?? page.lang)` is correct for all three cases because the loader already defaults `page.lang` to `"en"`; all three are tested through `compilePage`.

### `--site` CLI threading

The `--site` branch reads `rest[++i]` unconditionally and stores it only for build/check, placed among the always-consumed path flags so it never reaches the positional-capture branch — `adx serve dist --site s.json`, `adx tokens --site s.json`, and `adx init app --site s.json` cannot capture the value as `dir`, asserted directly. A combined `serve ... --site ... --port ... --host` case confirms port/host still parse while `site` stays undefined, so the serve-only gating is untouched. `runPage` resolves `args.site` against CWD before the check/build split, and `compilePage` resolves again (idempotent on an absolute path, harmless); because `checkPage` delegates to `compilePage` with the same options, check and build merge site assets identically — now backed by the direct `checkPage` assertion.

### Security and SEO posture

css hrefs and js src/type flow through `escapeHtml` at emission, now with a direct hostile-input regression test asserting the exact escaped `type="…"`/`src="…"` text for a `src` of `"></script><x href="&<>` and a `type` of `"><x>&`, so a future removal of `escapeHtml` from `scriptTag` fails the suite. Author `js` is pinned after the glue module in the markup, preserving the no-blocking-author-script-in-head rule for the structured path. The one intentional exception is the raw `head` array, emitted unescaped: an author who puts a blocking `<script>` or malformed markup there bypasses those guarantees. That is the documented, author-trusted escape hatch for tags ADX does not model, and the docs caution explicitly against feeding untrusted input into it. No unresolved `{{` is introduced by any asset path, asserted in the SEO suite.

### Docs sync

All six target docs are updated and mutually consistent: agent-reference carries the `assets` field table, the `--site`/site-config/merge/CSS-order rules, the full error-string list, the browser-URL-resolution note, and the explicit AGENT RULE steering Tailwind/any CSS library to build-time static CSS while calling out the runtime-CDN pattern as wrong; adx-grammar documents the JSON schema and three-way guard; architecture frames the SEO/static fit with the narrowed markup-order wording; human-guide has the worked Tailwind walkthrough using `/tailwind.css` + `dist/tailwind.css` with the Play-CDN caveat; roadmap marks the feature shipped with replace-semantics and auto-discovery as future; README lists the capability in the 0.1.0-alpha voice. The cross-link anchor `#external-design-library-assets` in README and adx-grammar matches the agent-reference heading `External design-library assets`.

### Test coverage

Covered: exact emission for no-assets / css-only / js-only / head-only / all-three, each golden `<script>` string, href escaping, whitespace-only href, empty-string head, and the hostile-`src`/`type` escaping regression; the full `validateAssets` error table including the pinned `js`-entry classification per kind; `mergeAssets` concat/dedupe/no-dedupe-head; `lang` precedence (all three cases); `parseSite`/`loadSite` including unreadable-path and site-label errors; the `--site` arg matrix across build/check/serve/tokens/init plus port/host gating; the SEO contract (no `{{`, glue-before-author, verbatim head, escaped href); the direct `checkPage` merge assertion; and the stored-golden byte-identity guard for both existing fixtures.

</details>

<details>
<summary>File map</summary>

- `src/page/types.ts` — new `PageAssetScript`, `PageAssets`, `SiteConfig` types; optional `assets` and internal `langExplicit` on `PageManifest`.
- `src/page/load.ts` — shared `validateAssets` (+ css/js/head sub-validators, `normalizeJsSrc`); wired into `parsePage`; sets `langExplicit`.
- `src/page/site.ts` (new) — `loadSite`/`parseSite` reusing `validateAssets`; site `lang` validation; site-labeled errors.
- `src/page/compile.ts` — `sitePath` option; `mergeAssets` + `dedupeStrings`/`dedupeBySrc`; `wrapPageDocument` third `assets` param and `scriptTag` (narrowed markup-order comment); site load + merge + effective-lang in `compilePage`.
- `src/index.ts` — export `loadSite`/`parseSite`/`mergeAssets` and the three new types.
- `src/cli.ts` — `--site` flag (always-consume / build-check-store); `sitePath` threading in `runPage`; usage/help/COMMANDS/doc-comment updates.
- `fixtures/site/{site.json,styled.json,tailwind.css}` (new) — site config and page both using root-absolute `/tailwind.css`, a page-local `./page-extra.css`, and a static Tailwind-output stub.
- `test/{page-load,page-compile,seo-contract,cli-commands}.test.ts` + `test/site-config.test.ts` (new) — validation, emission, merge, lang, CLI, SEO, hostile-input escaping, stored-golden, and direct checkPage-merge coverage.
- `docs/{agent-reference,adx-grammar,architecture,human-guide,roadmap}.md`, `README.md` — feature + AGENT RULE documentation, markup-order wording, root-absolute URL guidance.

Full diff: `git diff HEAD` (working tree, uncommitted).

</details>
