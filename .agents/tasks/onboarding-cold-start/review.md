# Review: docs/onboarding-cold-start

## Scope
DOCS-CLARITY fix adding a cold-start guard to three surfaces so agents run `adx init`
instead of `npm install project-adx-0` into an empty directory. Judged against the
approved intent and the original report (agent cold-started with `npm init` +
`npm install project-adx-0` and hand-scaffolded).

## Evidence read
- `setup.json`: base `main`, branch `docs/onboarding-cold-start`.
- `git diff main...HEAD`: three files changed — README.md, docs/agent-reference.md,
  src/scaffold.ts. Wording + one template bullet only.
- Commit message verification: `npm run build` (tsc) exit 0; `node dist/cli.js init`
  spot-check regenerated AGENTS.md with the new bullet, well-formed, temp dir removed;
  `npm test` 28 files / 338 tests passed. Evidence present — not re-run.

## Checks against the required criteria

1. **Guard present and agreeing on all three surfaces** — PASS.
   - README Quick Start blockquote (lines ~42-47): new/empty -> `adx init` one-liner;
     bare `npm install project-adx-0` leaves no layout; direct install only inside an
     existing ADX app missing the dep.
   - README starter prompt (lines ~108-114): distinguishes "no ADX project yet" ->
     `npx ... adx init my-app`, never `npm install` into empty dir; vs "existing app"
     -> work inside, `npm install`, read agent-reference.
   - docs/agent-reference.md "Install and First Page" (lines ~24-30): same guard,
     agent-phrased; direct `npm install --save-dev --save-exact project-adx-0` only
     for existing app missing the dep.
   - src/scaffold.ts AGENTS.md template "Local CLI and workflow" (lines ~281-284):
     file lives in an already-initialized project; to start new use `adx init` via
     `npx --yes --package project-adx-0 adx init <name>`, never a bare
     `npm install project-adx-0` into an empty dir.
   All four messages are mutually consistent.

2. **Package vs command name accurate** — PASS. Package `project-adx-0`, executable
   `adx` used correctly throughout. `grep "npm install adx"` across the three files
   returns nothing (exit 1). scaffold.ts retains its existing "Do not install the npm
   package named `adx`" warning.

3. **Markdown structure preserved** — PASS. Additions are a well-formed blockquote
   and inline bold/code in existing prose and the fenced `text` prompt block. No
   badges, tables, anchors, or headings altered; surrounding code fences intact.

4. **No CLI/compiler behavior changed** — PASS. Only doc prose and one template-string
   bullet in scaffold.ts; no executable logic touched. init spot-check confirms the
   template still renders a well-formed AGENTS.md.

5. **scaffold.ts valid TypeScript / escaping** — PASS. New lines sit inside the
   existing template literal; all backticks escaped as `` \` `` consistent with
   neighboring lines. tsc build exit 0 corroborates.

## Verdict
No blocking findings. The change accomplishes the approved cold-start clarification
on all three surfaces with accurate naming, preserved structure, and recorded
verification.

APPROVED
