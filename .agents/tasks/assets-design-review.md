# Design Review — External-asset (`assets`) feature for ADX pages

**Reviewed document:** `.agents/tasks/assets-design.md`
**Reviewed against:** `src/page/compile.ts`, `src/page/load.ts`, `src/page/types.ts`,
`src/cli.ts`, `src/compile.ts`, `src/index.ts`, `test/seo-contract.test.ts`,
`test/page-compile.test.ts`, `test/cli-commands.test.ts`, `test/helpers.ts`,
`fixtures/site/`, and `docs/`.

This is the third review round. The design records two prior rounds (round 1:
8 findings, all addressed; round 2: 1 MEDIUM + 2 NIT, all addressed). I
re-derived every load-bearing claim from the real source rather than trusting
the design's own account of it.

---

## Verified assumptions (checked against real source)

1. **`wrapPageDocument` document shape.** Confirmed in `src/page/compile.ts`.
   The `<head>` ends with the literal line `  <link rel="stylesheet" href="style.css" />`
   and the body ends with `  <script type="module" src="glue.js"></script>`
   just before `</body>`. The design's ordering table (token `style.css` is the
   last `<head>` stylesheet; glue script last before `</body>`) matches exactly,
   including the two-space indent and ` />` self-closing style the new CSS
   fragments must mirror.

2. **`wrapPageDocument` signature + export.** It is `export function
   wrapPageDocument(bodies: string[], page: PageManifest): string` and is
   directly imported/unit-tested by `test/seo-contract.test.ts`. Adding an
   optional third `assets?` param is a backward-compatible seam, as claimed.

3. **`escapeHtml` behavior.** `src/compile.ts` escapes `&`, `<`, `>`, `"` only
   (NOT `'`). The design's parenthetical "(attribute-safe: `&`, `<`, `>`, `"`)"
   is exactly right. Double-quoted attribute values are therefore safe; the
   design never emits single-quoted attributes, so omitting `'` is fine.

4. **`escapeHtml` is re-exported from `src/index.ts`; `serializeScriptJson` is
   NOT.** Confirmed: `src/index.ts` re-exports `escapeHtml` from `./compile.js`
   but has no `serializeScriptJson` export. The design's round-2 Finding 2
   correction (drop `serializeScriptJson` from the helper list; it is internal
   JSON-LD only and not needed by this feature) is accurate.

5. **`adxFileError` message format.** Page errors already read `[ADX] <file> -
   <msg>` (e.g. `loadPage`/`parsePage` in `src/page/load.ts`). The new messages
   follow the same convention.

6. **`requireString` / `optionalString` semantics.** `requireString` rejects
   only on `typeof !== "string" || value.length === 0` — NO trimming. The
   design's "non-empty = `length > 0`, no trimming, so `"  "` is accepted
   verbatim" claim for `js.src` matches the loader's real precedent.
   `optionalString` throws `Field "<field>" must be a string`; the design's
   site `lang` message ("reusing the page loader's `optionalString`
   style/message") is consistent with the real string.

7. **`validateComponent` three-way guard.** `src/page/load.ts` uses `typeof
   value !== "object" || value === null || Array.isArray(value)` — the exact
   precedent the design pins for the `js`-entry classifier. The round-2 Finding
   1 fix (pinned `typeof === "string"` → object-gate → else-throw order) is
   faithful to real code and correctly prevents a `TypeError` on `null`/array
   and prevents the wrong error message.

8. **`compilePage` / `checkPage` relationship + `CompilePageOptions`.**
   `checkPage(path, opts)` delegates to `compilePage(path, opts)` with the same
   `CompilePageOptions` (currently `{ tokensPath? }`). The design's plan to add
   `sitePath?` to `CompilePageOptions` and thread it once so check and build
   merge identically is correct and requires no extra wiring.

9. **`compilePage` builds the doc via one `wrapPageDocument(bodies, page)`
   call.** Confirmed — the merge-then-wrap plan has a single, correct seam.

10. **CLI `parseArgs` loop structure.** `--out`/`--tokens`/`--data` are consumed
    unconditionally; `--port`/`--host` are gated behind `isServe`. The positional
    capture branch is `!arg.startsWith("--") && parsed.dir === undefined`. The
    design's plan to add `--site` among the always-consumed path flags (consume
    value unconditionally via `rest[++i]`, store only for build/check) is the
    correct way to prevent the value leaking into the positional `dir` for
    `serve`/`tokens`/`init`. `--port`/`--host` gating and `isEntryPoint()` are
    untouched by that branch.

11. **`ParsedArgs` field convention + `argsFor` base.** Existing optional flags
    (`tokens`/`data`/`port`/`host`) are typed `T | undefined` with NO `?`, i.e.
    required keys. `test/cli-commands.test.ts`'s `argsFor()` spreads a fully
    populated base literal. The design's note that `ParsedArgs` gains `site:
    string | undefined` and the `argsFor` base MUST add `site: undefined` (or
    the test file won't compile) is correct.

12. **`runPage` builds `opts` once, then branches check vs build.** Confirmed —
    setting `opts.sitePath` before the `command === "check"` branch is the right
    place.

13. **`fixtures/site/` already exists** with `index.json`, `about.json`, and
    `site-header/`, consumed via `helpers.siteDir`. Both `index.json` and
    `about.json` set `lang: "en"` **explicitly**; `about.json` additionally has
    explicit `canonical` + `schema`. This confirms (a) round-1 Finding 2's
    "already exists / leave untouched" claim, and (b) that under the new `lang`
    rule both fixtures have `langExplicit = true`, so a site `lang` default
    could never override them — the byte-identity guarantee holds for them.

14. **Existing SEO-contract assertion.** `test/seo-contract.test.ts` asserts
    `indexOf('src="glue.js"') > indexOf("</head>")`. The design's claim that this
    continues to hold (glue stays after `</head>`, author js after glue) is
    correct, and the proposed added assertion `indexOf('src="glue.js"') <
    indexOf(authorSrc)` is a sound strengthening.

15. **Docs-sync targets all exist.** `docs/agent-reference.md`,
    `docs/adx-grammar.md`, `docs/human-guide.md`, `docs/architecture.md`,
    `docs/roadmap.md`, and `README.md` all exist. The docs-sync list is complete
    and correctly targets the canonical agent-facing + human-facing surfaces per
    the documentation steering.

## Unverified / wrong assumptions

None. Every load-bearing claim the design makes about existing code was
verified against source and found accurate. The design does not rely on any
behavior I could not confirm.

---

## Findings

### 1. NIT — `assets.css` "non-empty" is asserted but its exact definition is not pinned (unlike `js.src`)

**Where:** "`css` — external stylesheet links" and the Validation section.

The design pins the `js` "non-empty" rule precisely — `length > 0`, no trimming,
so `"  "` is accepted — and ties it to the loader's `requireString` precedent.
The `css` section only says "array of non-empty strings" and gives the failure
message, but never states whether "non-empty" for a css href means the same
`length > 0`/no-trim rule. An implementer could reasonably reject `"  "` for css
while accepting it for `js.src`, producing an inconsistency between two fields
that are supposed to share one `validateAssets`.

**Fix:** Add one sentence to the `css` section: *"'non-empty' is `length > 0`
with no trimming, identical to the `js.src` rule — `validateAssets` applies the
same string check to css hrefs and js srcs."* Then add a unit case `css: ["  "]`
(whitespace-only) asserting it is **accepted** and escaped verbatim, mirroring
the `js.src` whitespace case.

### 2. NIT — `assets.head` empty-string entry behavior is unspecified

**Where:** "`head` — raw escape hatch" and the Validation section.

The rule is `assets.head present but not an array of strings → "assets.head"
must be an array of strings`. Unlike `css` (non-empty strings) and `js.src`
(non-empty), `head` is specified only as "array of strings", so an empty-string
entry `head: [""]` passes validation and the emitter produces a line of pure
indentation (`\n  ` with no content). This is harmless but unspecified — a
reader cannot tell from the design whether `head: [""]` is intended to be legal
or a mistake to reject.

**Fix:** State the intent explicitly. Recommended: *"`head` entries are strings
with no non-empty requirement (a raw passthrough); an empty string is legal and
emits only the indentation line."* Add a one-line unit assertion for `head:
[""]` so the behavior is locked rather than incidental.

---

## Severity tally

- HIGH: 0
- MEDIUM: 0
- NIT: 2

Both open findings are NITs — small specification tightenings on two
low-risk edges (whitespace-only css href; empty-string head entry) that do not
change any locked decision and do not affect the high-risk invariants
(byte-identity, `--site` token consumption, escaping stance, merge/dedupe, lang
precedence, SEO safety), all of which I verified directly against source and
found correct and unambiguous.

## Verdict

**APPROVED** (0 HIGH, 0 MEDIUM). The two NITs are recommended polish, not
blockers; they do not gate the verdict.
