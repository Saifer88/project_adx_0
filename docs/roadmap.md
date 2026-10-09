# ADX Roadmap

Tracks what is built and what comes next. Status language mirrors the README
Development Roadmap: ✅ done, 🚧 in progress, ❌ not started.

## Shipped — Milestone 1 (compiler vertical slice)

Compile one component (the four `.adx` files) to static HTML + scoped CSS +
hydration-only glue. Build/time interpolation (zero `{{ }}` in output, the SEO
contract), design-token system, `adx build` / `adx check` CLI, 77 tests. Single
npm package `adx` at the repo root.

## Next — Milestone 2 (make it usable for real sites + prove the claim)

Goal: move from "compiles one demo component with default data" to "an agent can
build a real, crawlable multi-page site" — and back the token-efficiency claim
with measured numbers. Each item below came from reviewing M1 as the end user
(an AI agent) would.

### 1. Real data binding ❌ (highest priority)
Today a component renders from manifest **defaults only**, so a required prop with
no default emits an empty element (e.g. `<h2></h2>`). This contradicts the SEO
promise. M2 adds a data source so real values fill the HTML at build time.
- CLI gains `--data <file.json>`; the compile pipeline accepts a props object.
- The compiler runs each component's `setup()` at build time to get the real
  state it renders. **Decided: sandboxed execution** (see note below).
- Required-prop validation: error (documented `[ADX] ...` format) when a required
  prop has neither a default nor supplied data — no more silent empty headings.

### 2. Pages (compile more than one component) ❌
A page concept that emits one complete `index.html` per page under a clean,
crawlable URL (`pages/about/` → `/about/index.html`).
- **Decided: page format is a JSON page manifest** — lists the components a page
  uses plus their data. Token-cheap, trivial for an agent to emit, consistent
  with the API-driven pillar.

### 3. Component composition ❌
One component uses another: resolve custom tags (`<user-card :name="...">`)
against `manifest.deps`, project parent content into child slots (wire the
`data-adx-slot` placeholders M1 already parses), pass props parent→child, keep
scoped CSS isolated. Detect dependency cycles with a clear error.

### 4. Reactivity semantics ❌
Define exactly what updates when a handler mutates state. Minimal, explicit model:
on handler return, re-evaluate only the bindings of affected nodes and patch
text/attributes directly — no virtual DOM, consistent with the hydration-only
runtime. Document the guarantee and its limits.

### 5. Measured token benchmark ❌
Replace the hand-estimated figures in `docs/comparison.md` with real numbers from
an actual tokenizer, comparing ADX source vs. an equivalent React implementation
across understand / modify / add-prop tasks. Ship a reproducible `benchmark/` +
`npm run benchmark`. Update the docs with the measured result honestly — if it is
below the advertised 60-80%, adjust the claim rather than the measurement.

### 6. Documentation sync ❌
Grammar (component resolution + slot projection move from "later milestone" to
spec'd), agent-reference (`--data`, page build, composition, reactivity, benchmark
command), human-guide (worked example: a small 2-page site from 2 composed
components with real data), README roadmap rows.

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

## Later milestones (unscheduled)
Pattern library, dev server + hot reload, `adx create`/`tokens`/`pattern` CLI,
compile-time WCAG-AA audit, sitemap.xml/robots.txt generation, bundle-size
budgets, VS Code extension, browser devtools. See the README roadmap table.

## Distribution (how users get it)
The repo is one npm package (`adx`). Intended flow: push to GitHub → a GitHub
Action builds (`npm run build`) and publishes to npm → users `npm install -g adx`
and run `adx build <their-component>` to compile their own code. Not yet published
(`0.1.0-alpha`); CI publish pipeline is not set up yet.
