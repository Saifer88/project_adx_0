# Review — `adx init` app-shell root + optional `--tailwind`

Branch `feat/init-app-shell-tailwind` @ `e1d5394`, base `main` @ `fe457fc`.
Reviewed the diff against the plan, design-check, the recorded verification
evidence, and the feature's 10 requirements. Scope of change (diff --stat):
`src/scaffold.ts`, `src/cli.ts`, `test/init.test.ts`, `test/cli-commands.test.ts`,
`README.md`, `docs/agent-reference.md`, `docs/human-guide.md` (plus the task
artifacts). No compiler/codegen source touched — confirmed by the file list.

## Evidence used
- Read the full diff of all source/test/doc files.
- Read `verification.md` (recorded build/test output); did NOT re-run the suite.
- Spot-verified, without re-running tests: `usage()` body, framework
  `package.json` Tailwind pins, cold-start guard wording, AGENTS npm-package
  guard, absence of spawn/exec/fetch in scaffold/cli, and import completeness in
  `test/init.test.ts`.

## Requirement-by-requirement

1. **app-shell four-file component, named regions, semantic HTML, token-only,
   a11y.** PASS. `app-shell/{manifest.json,structure.adx,behavior.adx.js,style.adx.css}`
   added as embedded templates. Structure is semantic (`<header>/<section>/<footer>`
   inside a `<div>` wrapper — deliberately NOT a second `<main>` because the page
   wrapper already emits `<main>`). Single `<h1>` in the header; hello-card title
   demoted to `<h2>` (no skipped level). `style.adx.css` is `@use tokens;` with
   token-only values and the same raw-CSS/token mix the existing `hello-card`
   style already uses (compiler accepts it; recorded run shows no leftover
   `tokens.`). Readable centered `max-width` measure and reduced-motion-safe (no
   motion). The "named header/main/footer slots" are realized as semantic layout
   regions rather than ADX `<slot>` outlets — a correct call: a top-level
   component's `<slot>` would leak an unfilled placeholder into the page HTML
   (`codegen/html.ts#emitSlot`), so declaring `"slots": []` and rendering real
   regions is the right, syntax-honest realization.

2. **index.json composes app-shell as root with hello-card in its content region,
   existing syntax only.** PASS. Page uses the standard `components: [{ use:
   "./app-shell", data }]` shape; app-shell composes the child via `deps:
   ["../hello-card"]` + the kebab element `<hello-card />` — the verified existing
   composition mechanism. No page-level slot syntax invented.

3. **All new files routed through SCAFFOLD_FILES / writeFileSet, conflict-safe,
   no npm/network.** PASS. The four app-shell files are new `SCAFFOLD_FILES`
   entries; the conditional Tailwind files are layered in `scaffoldProject` and
   the full assembled set passes through `writeFileSet` (clobber guard runs over
   every file before any write). Tests assert no partial write for both default
   and `--tailwind` conflicts, including a new `app-shell/manifest.json`
   non-creation check. No spawn/exec/fetch in `scaffold.ts` or `cli.ts`.

4. **`--tailwind` non-interactive flag in existing cli.ts style, documented.**
   PASS. Added `tailwind?: boolean` to `ParsedArgs`; gated with
   `const isInit = command === "init"` and `else if (isInit && arg ===
   "--tailwind")`, exactly mirroring the `--list`/`isPattern` precedent. Documented
   in the `adx init` doc comment, the `COMMANDS` table (fed to `helpText()` /
   `adx help`), and all three docs with `adx init [name] [--tailwind]`.
   NOTE (not a blocker): the short error-path `usage()` literal still reads
   `adx init [name]`. The coder deliberately left `usage()` byte-stable (its own
   comment and a regression test pin it verbatim for stderr stability) and surfaced
   the flag through the full `adx help` listing instead. Requirement #4's
   "help/usage" is satisfied by the documented help output; the deviation from the
   plan's step-5 wording is intentional and sound.

5. **`--tailwind` adds exact pinned @tailwindcss/cli 4.3.3 dev dep + tailwind
   build script, input CSS, assets.css to compiled tailwind.css (not CDN).** PASS.
   Framework `package.json` pins `@tailwindcss/cli` and `tailwindcss` to exactly
   `4.3.3`; the Tailwind-aware thunk reads those exact strings from the CLI's own
   `../package.json` (not hardcoded) and throws the standard `[ADX]` error if
   either is missing (so a broken install writes nothing). Adds
   `tailwind: "@tailwindcss/cli -i styles/tailwind.css -o dist/tailwind.css
   --minify"` and `build: "npm run tailwind && adx build index.json"`. Scaffolds
   `styles/tailwind.css` (`@import "tailwindcss" source("../");`). The Tailwind
   `index.json` references `/tailwind.css` via `assets.css` (build-time path to
   `dist/tailwind.css`, not the Play CDN).

6. **Without the flag, output unchanged except Feature 1; every prop defaults.**
   PASS. Base `PAGE` has no `assets`, base package scripts unchanged, no `styles/`
   dir — asserted by the new "default (no flag)" test. All app-shell props
   (`appName`, `tagline`, `year`) and hello-card props default, so bare
   `adx check index.json` passes with no `--data` (recorded).

7. **Package `project-adx-0` / executable `adx` kept accurate.** PASS. Generated
   package stays `adx-app` with the ADX dep pinned to `project-adx-0`; AGENTS guard
   "Do not install the npm package named `adx`; that is the executable name" and
   the cold-start "do NOT `npm install project-adx-0`" guard are intact in
   README/agent-reference/AGENTS.

8. **No compiler/codegen behavior changed.** PASS. Diff touches only
   `scaffold.ts`, `cli.ts`, their tests, and docs.

9. **Docs updated consistently, cold-start guard intact.** PASS. README,
   agent-reference, human-guide all updated for the app-shell root and
   `--tailwind`; the human-guide Tailwind example correctly demotes its heading to
   `<h2>` to match the new single-`<h1>` shell. Grammar doc needed no change
   (existing `deps`/composition only). Cold-start guard verified present verbatim.

10. **Tests added/extended; recorded count grew, no regressions.** PASS. Recorded
    `vitest run` = 348 passed (28 files), up from the 338 baseline; +10 matches the
    diff (7 new `scaffoldProject` cases incl. the 2-case `it.each` clobber, 2 new
    CLI dispatch cases, 1 new `parseArgs` gating case). New assertions cover
    heading hierarchy (1 `<h1>`, has `<h2>`, no `<h3>`), semantic regions, the
    app-shell compile, Tailwind file/dep/script/assets wiring, no-install
    guarantee, and clobber safety. Imports (`mkdirSync`, `dirname`) present.
    `npm run build` recorded clean.

## Verdict
No blocking findings. All ten requirements are met; the one plan deviation
(`usage()` left byte-stable, flag documented via `adx help`) is deliberate,
justified, and still satisfies the requirement. Recorded verification is detailed,
internally consistent, and corroborated by the diff — no articulable doubt
warranting a re-run.

APPROVED.
