# ADX Roadmap

Tracks what is built and what comes next. Status language mirrors the README
Development Roadmap: ✅ done, 🚧 in progress, ❌ not started.

## Shipped — Milestone 1 (compiler vertical slice)

Compile one component (the four `.adx` files) to static HTML + scoped CSS +
hydration-only glue. Build/time interpolation (zero `{{ }}` in output, the SEO
contract), design-token system, `adx build` / `adx check` CLI, 77 tests. Single
npm package (`project-adx-0`, CLI command `adx`) at the repo root.

## Shipped — Milestone 2 (usable for real sites + the claim measured)

Goal (met): move from "compiles one demo component with default data" to "an agent
can build a real, crawlable multi-page site" — and back the token-efficiency claim
with measured numbers. All six phases landed in one milestone. Each item below
came from reviewing M1 as the end user (an AI agent) would.

### 1. Real data binding ✅ (highest priority)
Today a component renders from manifest **defaults only**, so a required prop with
no default emits an empty element (e.g. `<h2></h2>`). This contradicts the SEO
promise. M2 adds a data source so real values fill the HTML at build time.
- CLI gains `--data <file.json>`; the compile pipeline accepts a props object.
- The compiler runs each component's `setup()` at build time to get the real
  state it renders. **Decided: sandboxed execution** (see note below).
- Required-prop validation: error (documented `[ADX] ...` format) when a required
  prop has neither a default nor supplied data — no more silent empty headings.

### 2. Pages (compile more than one component) ✅
A page concept that emits one complete `index.html` per page under a clean,
crawlable URL (`pages/about/` → `/about/index.html`).
- **Decided: page format is a JSON page manifest** — lists the components a page
  uses plus their data. Token-cheap, trivial for an agent to emit, consistent
  with the API-driven pillar.

### 3. Component composition ✅
One component uses another: custom tags (`<user-card :name="...">`) resolve
against `manifest.deps`, parent content projects into child slots
(`<template slot="name">` on the parent, `<slot name />` on the child), props pass
parent→child, and scoped CSS stays isolated via repo-relative child scope ids.
Dependency cycles fail with a clear error. The same component used N times
hydrates per-instance (`data-adx-i`, three-part hook ids).

### 4. Reactivity semantics ✅
On handler return, the glue re-evaluates and patches only the affected nodes'
text/attributes for that instance — no virtual DOM, no `setup()` re-run,
consistent with the hydration-only runtime. Single bare computed-backed (`get*`)
interpolations/`:prop` bindings re-evaluate on handler return via their imported
`get*` over the live state. Limits are documented and enforced: no structural
reactivity, and computed member chains / mixed templates stay frozen at their
build-time value.

### 5. Measured token benchmark ✅
Replaced the hand-estimated figures with real numbers from a reproducible
`benchmark/` + `npm run benchmark` (`gpt-tokenizer`, o200k_base), comparing the
ADX fixture vs. a faithful minimal React equivalent across understand /
modify-style / add-prop. Measured savings are ~13-14% — below the advertised
60-80%, so the **claim** was adjusted to the measured range (not the measurement),
with the estimates kept and labelled. See `docs/comparison.md` /
`docs/token-efficiency.md`.

### 6. Documentation sync ✅
Grammar (component resolution + slot projection now specified, with the pinned
`get*`→bare-key rule), agent-reference (`--data`, page build, composition,
reactivity, `npm run benchmark`), human-guide (worked 2-page composed-site
example; sandboxed `setup()` described), architecture (build-time sandbox +
reactivity + security note), comparison / token-efficiency (Measured table),
roadmap + README rows — all updated in this milestone.

### How `setup()` runs at build time: Trusted Execution
To emit real content the compiler must obtain each component's state, which comes
from `setup()` in the user's `behavior.adx.js`. The code executed is the **user's**,
run by the compiler, on the machine running `adx build` (the user's laptop or CI).

Risk only arises when the person running the build did not write the component
(e.g. CI building a contributor's PR, or compiling a third-party component): a
naive compiler would run whatever that `setup()` contains, including malicious
filesystem/network calls.

**Decision: execute trusted `setup()` code in a Node `vm` context with a timeout.**
Omitted globals do not prevent access to the host via constructors. This is not a
security sandbox. Both `build` and `check` execute code; untrusted components
require external isolation with restricted filesystem, network, credentials and
resources. A separate process alone does not supply those protections.

### Reliability Follow-up

- Isolated instance state and per-instance hook plans, including conditional DOM.
- Correct boolean/form bindings and frozen nested loop content.
- Acorn-based behavior parsing, typed props/defaults and safe JSON-LD.
- One compilation pipeline for parents and children; collision-safe sidecars in
  both standalone and page builds.
- Chromium CLI regressions on desktop/mobile and CI on Node 22/24.
- Working Quick Start and explicit labels on unavailable pattern/lifecycle APIs.

### Sequencing — DECIDED: all phases in one milestone
Build Phases 1-6 together as a single M2, rather than splitting into M2a/M2b.

## Open: broaden the token benchmark (settle the headline claim)

The original M2 UserCard benchmark measures ~13-14% source-reading savings.
A support portal now adds five routes, five reusable components per framework,
shared data/CSS and real React prerendering/hydration. Shared browser checks prove
content and interaction parity at desktop/mobile sizes. Selected portal reading
tasks show -7.9% to 60.6% savings, including a 4.0% ADX regression for a complete
read. This does not settle the 60-80% full-workflow design target. Remaining work:
- **Manifest-scan-only**: read just `manifest.json` to learn the API vs. parsing
  the full React component — ADX's strongest single case.
- **Full modify-and-explain**: count reasoning + writing + explanation tokens, not
  just reading, across a real edit (ADX's estimated wins were largest here).
- **Recorded application trials**: use the shipped portal tasks, keep failure
  costs, and apply the same Caveman ultra policy to both frameworks.
Then update the docs with whichever figure the broadened benchmark actually shows —
raising or lowering the claim to match the measurement, not the reverse.

Recording/reporting support is now available through
`npm run benchmark -- --workflow runs.json`. Task prompts and acceptance criteria
are in `benchmark/tasks.json`; the protocol is in `benchmark/README.md`.
Build the equivalent portals with `npm run benchmark:app`. Actual paired agent
runs still need to be collected. No end-to-end savings are claimed from the
source-reading measurements.

## Shipped — project scaffolding (`adx init`) ✅

`adx init [name]` scaffolds a minimal, buildable starter project (one
`hello-card` component, an `index.json` page, tokens, README, `AGENTS.md`, `.gitignore`, and
`package.json` with build/check/serve scripts and an exact local ADX dev dependency)
into `./<name>` — or the current directory when the name is omitted or `.`. It
refuses to overwrite an existing scaffold file (writing nothing on conflict),
and leaves installation explicit. Run `npm install`, then `npm run check`,
`npm run build`, and `npm run serve`; no global CLI or `--data` is needed.
Commit the generated npm lockfile so a clone can install the same dependency tree.
The generated agent instructions set concise chat defaults, application scope,
and local CLI setup guidance; they do not require a separate Caveman installation.

## Shipped — add one component (`adx create`) ✅

`adx create <component-name>` scaffolds ONE new four-file component
(`<name>/{manifest.json,structure.adx,behavior.adx.js,style.adx.css}`) into an
existing project from a minimal, valid, token-using, WCAG-AA template whose props
all default — so `adx build <name>` and `adx check <name>` succeed with no
`--data`. The name is a lowercase, hyphenated slug (also the directory name and,
PascalCased, the manifest name); an invalid name is rejected with an `[ADX] …
invalid component name` error. Like `adx init`, it refuses to overwrite: if any
of the four files already exists it writes nothing and exits 1 with the `[ADX] …
already exists; refusing to overwrite` error. The one conflict-safe writer
(`writeFileSet`) now backs both `init` and `create`.

## Shipped — built-in patterns (`adx pattern`) ✅

`adx pattern [<name>] [targetDir] [--list]` scaffolds ONE accessible-by-default
pattern component from a data-driven catalog (`form`, `table`, `modal`) into
`<targetDir>/<name>/` (`targetDir` defaults to the pattern name). Each pattern is
four `.adx` files whose props all default — so `adx build`/`adx check` succeed
with no `--data` — using design tokens only and a token-sized touch target on
interactive controls (the same WCAG-AA bar as `init`/`create`). Semantics are
accessible by default: the `form` has `<label for>`+`<input id>`, hint text, and
an `aria-live` error region whose text is a computed `{{nameError}}` (live-patched
on submit via `getNameError` — it relies on FEAT's computed runtime, kept live by
the `@submit` handler); the `table` has a `<caption>`, `<thead>`/`<tbody>`, and
`<th scope="col">` headers with `:for`-unrolled (frozen) rows; the `modal` has
`role="dialog"` + `aria-modal` + `aria-labelledby`, a keyboard close button, and
an `onClose` that emits `close`. Honest limit: `:if` open/close STRUCTURAL
toggling is not a runtime behavior — the modal ships correct static dialog
semantics and the close handler, and a host controls mounting. `adx pattern` with
no name or `--list` lists the catalog (sorted) and exits 0; an unknown name errors
`[ADX] <name> - unknown pattern (available: form, modal, table)` and exits 1; a
conflict writes nothing and exits 1. Adding a pattern is a pure data edit (a key
in the compiler's pattern catalog), reusing the shared `writeFileSet` guard.

## Shipped — first-class external design-library assets (pages) ✅

Pages can reference external CSS/JS (Tailwind or any design library) via an
optional `assets` object (`css`/`js`/`head`) on the page manifest and/or a shared
site config passed with `adx build/check <page.json> --site <site.json>` (explicit
flag, no auto-discovery). Site assets are the merge base; page assets append;
`css`/`js` dedupe first-wins (js by `src`), `head` is not deduped. The token
`style.css` is emitted before external `assets.css` (not an override guarantee:
importance, layers and specificity still apply); the hydration glue is emitted before author `assets.js` in the markup
(a document-order guarantee, not a runtime one — a classic/`async` author script
can still run before the deferred glue). Raw `assets.head` is injected verbatim
(author-trusted). Assets-free pages compile byte-for-byte as
before. **Blessed Tailwind path:** build-time static CSS — the author runs the
Tailwind CLI, ADX references the output and never runs Tailwind. Agents must not
inject a runtime CSS CDN `<script>` into a component (the old "Tailwind CDN in the
Navbar" pattern), which breaks the static/crawlable/minimal-JS contract. Scope is
pages only; asset reachability is not validated.

Future: **replace/override merge semantics** (a page clearing inherited assets) —
not built, concat+dedupe only; **site-config auto-discovery** (implicit `site.json`
lookup) — not built, explicit `--site` only; running Tailwind/any toolchain from
the compiler — never; per-component or standalone-build assets — out of scope.

## Shipped — sitemap.xml + robots.txt (site `baseUrl`) ✅

A page build with a site-config `baseUrl` (an absolute `http(s)` origin,
validated like `lang`) emits `sitemap.xml` (sitemaps 0.9, one XML-escaped `<loc>`
per compiled page — root slug → `<baseUrl>/`, else `<baseUrl>/<slug>/`, the clean
path derived from the **slug** not `canonical`) and allow-all `robots.txt`
(`User-agent: *` / `Allow: /` / `Sitemap: <baseUrl>/sitemap.xml`) into the
top-level `--out` root. Trailing slashes on `baseUrl` are normalized once so both
files agree and never double-slash. Both are build-time static text (no runtime
JS, SEO-safe). With no `baseUrl` (or no `--site`) neither file is written, no
error is raised, and page output is byte-for-byte unchanged; `check` never writes.

Future: multi-page sitemaps from a site-level manifest (today one build emits its
one page), `lastmod`/`changefreq`/`priority` fields, and sitemap index files —
not built.

## Later milestones (unscheduled)
A broader pattern library and richer `adx create`/`pattern` templates (beyond the
shipped `adx init` scaffolder, `adx create` component scaffolder, `adx pattern`
form/table/modal catalog, and `adx tokens` token listing), dev server + hot
reload, compile-time WCAG-AA audit,
bundle-size budgets, VS Code extension, browser devtools. See the README roadmap
table.

## Distribution (how users get it)
The repo is one npm package named `project-adx-0` (the CLI command it installs
stays `adx`). Flow: push to `main` → a GitHub Action
(`.github/workflows/publish.yml`) runs `npm ci && npm run build && npm test`,
then publishes to npm only when `package.json`'s version is not already there →
users `npm install -g project-adx-0` and run `adx build <their-component>` to
compile their own code. Automated publish-on-main is now configured. There is no
tag trigger: the current version (`0.1.0-alpha`) publishes on the next eligible
push to `main` if npm does not already have it, and each subsequent publish
requires bumping the version in `package.json` first (the guard skips a version
that is already on npm).

A static `adx serve [dir]` ships now for local preview — it serves already-compiled
output over HTTP and does not compile or hot-reload. The full dev server with hot
reload remains planned (see `adx dev` in the later-milestones list).
