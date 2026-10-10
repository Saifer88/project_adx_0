# ADX Roadmap

Tracks what is built and what comes next. Status language mirrors the README
Development Roadmap: ✅ done, 🚧 in progress, ❌ not started.

## Shipped — Milestone 1 (compiler vertical slice)

Compile one component (the four `.adx` files) to static HTML + scoped CSS +
hydration-only glue. Build/time interpolation (zero `{{ }}` in output, the SEO
contract), design-token system, `adx build` / `adx check` CLI, 77 tests. Single
npm package `adx` at the repo root.

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
consistent with the hydration-only runtime. Limits are documented and enforced: no
structural reactivity, and computed-backed (`get*`) interpolations are frozen at
their build-time value.

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

### How `setup()` runs at build time — DECIDED: sandboxed execution
To emit real content the compiler must obtain each component's state, which comes
from `setup()` in the user's `behavior.adx.js`. The code executed is the **user's**,
run by the compiler, on the machine running `adx build` (the user's laptop or CI).

Risk only arises when the person running the build did not write the component
(e.g. CI building a contributor's PR, or compiling a third-party component): a
naive compiler would run whatever that `setup()` contains, including malicious
filesystem/network calls.

**Decision: run the real `setup()` inside a hardened sandbox** (Node `vm` context):
no `require`, no `fs`, no network, no `process`, with an execution timeout. Normal
`setup()` logic (property assignments, `||` defaults, simple expressions) works;
dangerous calls fail because those globals do not exist in the sandbox. Chosen over
a restricted declarative subset because real components need real `setup()` logic;
the subset would frustrate the agent-user ADX targets. Document that compiling an
untrusted third-party component carries the same caution as running any untrusted
build tool.

### Sequencing — DECIDED: all phases in one milestone
Build Phases 1-6 together as a single M2, rather than splitting into M2a/M2b.

## Open: broaden the token benchmark (settle the headline claim)

The M2 benchmark is narrow — it measures only read-tokens on one small component
and so shows ~13-14%, far under the 60-80% design target. That slice does not test
the workflow the target describes, so it neither proves nor disproves it. Since
token efficiency is the project's entire reason to exist, the claim stays unsettled
until the benchmark is broadened. Needed tasks:
- **Manifest-scan-only**: read just `manifest.json` to learn the API vs. parsing
  the full React component — ADX's strongest single case.
- **Full modify-and-explain**: count reasoning + writing + explanation tokens, not
  just reading, across a real edit (ADX's estimated wins were largest here).
- **Larger / multi-component fixtures**: where React's per-file overhead compounds.
Then update the docs with whichever figure the broadened benchmark actually shows —
raising or lowering the claim to match the measurement, not the reverse.

## Later milestones (unscheduled)
Pattern library, dev server + hot reload, `adx create`/`tokens`/`pattern` CLI,
compile-time WCAG-AA audit, sitemap.xml/robots.txt generation, bundle-size
budgets, VS Code extension, browser devtools. See the README roadmap table.

## Distribution (how users get it)
The repo is one npm package (`adx`). Intended flow: push to GitHub → a GitHub
Action builds (`npm run build`) and publishes to npm → users `npm install -g adx`
and run `adx build <their-component>` to compile their own code. Not yet published
(`0.1.0-alpha`); CI publish pipeline is not set up yet.
