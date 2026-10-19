# Page/site asset support with static-first output

This change adds validated page- and site-level CSS, JavaScript, and raw head assets, merged through explicit `--site` input and emitted by the page document owner. Existing SEO metadata, token CSS, hydration glue, and byte-identical assets-free output are preserved, while Tailwind guidance now uses build-time static CSS. The two prior blockers—false runtime hydration ordering and incorrect shared Tailwind URLs—are resolved. One non-blocking regression-test gap remains: the added check-path assertion does not prove that `sitePath` was used.

Watch for: **confirmed, non-blocking** — `test/site-config.test.ts:134-140` still passes if `checkPage` stops forwarding `sitePath`, because `styled.json` compiles without the site config.

**Verdict**: APPROVED

## High-level view

Page and site inputs share one `validateAssets` boundary, preserving the approved `[ADX] <file> - <message>` contract and normalizing JavaScript shorthand. The explicit branch order keeps `null`, arrays, numbers, and booleans on the entry-shape error instead of the missing-`src` path or a raw runtime failure.

`wrapPageDocument` retains `style.css` and `glue.js` at their existing seams, then appends escaped external CSS, author-trusted raw head content, and escaped author scripts in the approved order. Empty fragments preserve prior bytes; stored goldens and SEO assertions cover assets-free output and zero unresolved interpolation.

`compilePage` applies site-first merge, exact first-wins CSS/JavaScript dedupe, undeduped head markup, and page-explicit language precedence. The CLI consumes `--site` for every command but stores it only for build/check; serve-only parsing and `isEntryPoint()` remain untouched.

The third-iteration record supplies the requested evidence: build and lint succeeded, all 268 tests passed, and built-CLI checks covered merged ordering, metadata, zero `{{`, check with `--site`, and assets-free output. Per request, these suites were not rerun.

<details>
<summary>Issues (1)</summary>

1. **Check-path assertion is non-discriminating (confirmed, non-blocking)** — `test/site-config.test.ts:134-140` only checks that a valid page does not throw, so it cannot detect dropped `sitePath` forwarding. Assert a site-only observable, such as a site-labeled error from a deliberately malformed temporary config.

</details>

<details><summary>Details</summary>

### Document seams preserve output and the raw-head trust boundary

```text
managed metadata → style.css → escaped external CSS → raw head
main content → glue.js → escaped external JavaScript
```

`href`, `src`, and `type` pass through `escapeHtml`, including hostile-attribute regression coverage. Raw `head` remains deliberately unescaped; **confirmed** as the documented author-trusted escape hatch, it can add arbitrary head markup and must never receive untrusted input. The revised script guidance now promises markup order only and tells hydration-dependent code to wait rather than assuming the glue has executed.

### Check-path test does not detect lost site forwarding

**Confirmed** at `test/site-config.test.ts:134-140`: `checkPage(styled.json, { sitePath })` is asserted only not to throw, but the page is independently valid. The test therefore also passes if `checkPage` drops `opts` or `compilePage` ignores `sitePath`, contrary to its comment. Use malformed site-only data and assert its site-labeled `[ADX]` error. This is non-blocking because production currently delegates with `opts` at `src/page/compile.ts:64-69`, and `runPage` shares the options object across check/build.

</details>

<details>
<summary>File map</summary>

- `src/page/types.ts`, `src/page/load.ts`, `src/page/site.ts` — define, normalize, and validate page/site assets.
- `src/page/compile.ts` — merge site defaults, resolve language, and emit document assets.
- `src/cli.ts`, `src/index.ts` — thread `--site` and expose the public API.
- `test/page-load.test.ts`, `test/page-compile.test.ts`, `test/site-config.test.ts`, `test/seo-contract.test.ts`, `test/cli-commands.test.ts` — cover validation, emission, merge, SEO output, and CLI parsing.
- `fixtures/site/*` — model site/page merge and static Tailwind output.
- `README.md`, `docs/{agent-reference,human-guide,adx-grammar,architecture,roadmap}.md` — document the schema, trust boundary, and static-library workflow.

Full working-tree diff: `git diff HEAD`; untracked additions: `git status --short`.

</details>
