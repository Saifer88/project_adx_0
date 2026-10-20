# Verification — `adx init` app-shell root + optional `--tailwind`

Branch `feat/init-app-shell-tailwind`. All commands run from the worktree root
`/Users/pirrima001/coding/personal/project_adx_0/.worktrees/init-app-shell-tailwind`.
The worktree's `node_modules` is a symlink to the parent checkout's (same repo,
identical deps) because a direct `npm install` hit an npm-cache permission error;
no npm install/network was run for the feature itself. The symlink is gitignored.

## 1. Type-check / build — PASS

```
$ npm run build        # tsc -p tsconfig.json
(exit 0, no output)
```
scaffold.ts template literals and the new packageJson(tailwind) thunk compile.

## 2. Default init end-to-end — PASS

```
$ node dist/cli.js init /tmp/adx-shell-check
Created ADX project in /tmp/adx-shell-check
  app-shell/manifest.json
  app-shell/structure.adx
  app-shell/behavior.adx.js
  app-shell/style.adx.css
  hello-card/manifest.json … hello-card/style.adx.css
  tokens/design-tokens.json
  index.json
  README.md
  package.json
  .gitignore
  AGENTS.md
Next steps: … npm install / npm run check / npm run build / npm run serve

$ (cd /tmp/adx-shell-check && node <cli> check index.json)   => OK
$ (cd /tmp/adx-shell-check && node <cli> build index.json)   => Built page index -> dist
```

Emitted `dist/index.html` inspection:
- `<h1` count = 1, `<h2` count = 1 (app-shell header owns the single h1; the
  composed hello-card title is an h2 — no skipped levels).
- `<header`, `<main`, `<footer` all present (page `<main>` wrapper + shell
  header/footer regions).
- Static markup contains "My ADX App" (shell title) and
  "Welcome to your new ADX project." (composed card greeting).
- No unresolved `{{` interpolations.

app-shell is the page root (placed by index.json `components: [{ use: ./app-shell }]`)
and hello-card renders inside the shell's `<section .app-content>` content region
via `deps: ["../hello-card"]` + `<hello-card />`. Check passes with NO `--data`
(every prop defaults).

## 3. Tailwind init end-to-end — PASS

```
$ node dist/cli.js init /tmp/adx-tw-check --tailwind
… writes the base set PLUS styles/tailwind.css ; prints an extra
"npm run tailwind" next step.
```

Generated `package.json` (verbatim-relevant fields):
- `devDependencies`: `project-adx-0` pinned to the generating CLI version, plus
  `"tailwindcss": "4.3.3"` and `"@tailwindcss/cli": "4.3.3"` (read from the CLI's
  OWN package.json devDependencies, not hardcoded).
- `scripts.tailwind` = `@tailwindcss/cli -i styles/tailwind.css -o dist/tailwind.css --minify`
- `scripts.build`   = `npm run tailwind && adx build index.json`

`styles/tailwind.css` = `@import "tailwindcss" source("../");`
`index.json` carries `"assets": { "css": ["/tailwind.css"] }`.

```
$ (cd /tmp/adx-tw-check && node <cli> check index.json)  => OK
$ (cd /tmp/adx-tw-check && node <cli> build index.json)  => Built page index -> dist
```
Emitted HTML links `style.css` then `tailwind.css` (external CSS after ADX's own,
the documented order). No `node_modules/`, no `package-lock.json`: init never ran
npm or the Tailwind CLI. The default (no-flag) init writes NO `styles/` dir, NO
Tailwind deps, and NO `assets` block.

## 4. Overwrite guard — PASS

```
$ node dist/cli.js init /tmp/adx-shell-check   # into the already-scaffolded dir
[ADX] /tmp/adx-shell-check/app-shell/manifest.json - already exists; refusing to overwrite
(exit 1)
```
Full file set (base + Tailwind) routes through SCAFFOLD_FILES/writeFileSet, so the
guard fails before any write; unit tests assert no other file is created on
conflict for both default and `--tailwind` runs.

## 5. Full test suite — PASS

```
$ npx vitest run
 Test Files  28 passed (28)
      Tests  348 passed (348)
```
Baseline was 338; +10 new (app-shell compile, --tailwind flag parsing/gating,
tailwind-vs-default package.json + file-set differences, tailwind clobber guard,
CLI dispatch for --tailwind and default, extended overwrite guard). Zero
regressions. Scoped: `npx vitest run test/init.test.ts test/cli-commands.test.ts`
=> 38 passed (init 23, cli-commands 15).

## 6. Docs consistency — PASS

`grep -l` confirms `app-shell` appears in README.md, docs/agent-reference.md,
src/scaffold.ts; `--tailwind` appears in README.md, docs/agent-reference.md,
docs/human-guide.md, src/scaffold.ts, src/cli.ts. The cold-start guard wording
("do NOT `npm install project-adx-0` into an empty dir") is intact in README and
agent-reference; human-guide's guard text is unchanged.

## No-npm / no-network guarantee

`scaffoldProject` and `runInit` contain no spawn/exec/fetch; `--tailwind` only
pins exact versions and writes config files. `usage()` is left byte-for-byte
unchanged (its regression test pins the four legacy lines); `--tailwind` is
documented in the `adx init` doc comment, the COMMANDS table, and `helpText()`.
