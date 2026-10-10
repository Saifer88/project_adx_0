# ADX Framework

**Agent-Driven Experience Framework**

![SEO Friendly](https://img.shields.io/badge/SEO-friendly-brightgreen)
![Token Efficient](https://img.shields.io/badge/AI-token--efficient-blue)

## Mission Statement

**Primary Goal**: Minimize token consumption for AI coding agents while maintaining human comprehensibility.

**Design Principle**: Every design decision prioritizes agent efficiency first, human ergonomics second. This is not negotiable and guides every evolution of the framework.

## What is ADX?

ADX is a frontend framework built from the ground up for AI coding agents. It aims
to cut the token overhead of reading and editing UI code while producing
production-quality interfaces that never look "AI-generated" or incomplete. The
first measured benchmark (`npm run benchmark`) shows ~13-14% fewer tokens than an
equivalent React component on single-component tasks; the long-term 60-80% target
assumes multi-component scale not yet measured.

This repository **is** the ADX compiler — one npm package (`adx`). The framework (syntax, tokens, patterns) is defined and enforced by the compiler; the `docs/` explain it.

## For AI Agents: Start Here

1. `docs/agent-reference.md` — canonical, token-efficient reference: `.adx` syntax, design tokens, CLI, UX/SEO baselines.
2. `docs/adx-grammar.md` — exact `.structure.adx` grammar (the parser's contract).
3. `src/` — the compiler. Entry: `src/cli.ts` → `src/compile.ts`.
4. `fixtures/user-card/` — a complete example component (the four `.adx` files).
5. Build & run: see **Build & Compile** below. Everything runs from the repo root.

## Core Philosophy

1. **Token-First**: Every syntax decision optimized for minimal token cost
2. **Flat & Explicit**: No magic, no hidden behavior, everything traceable
3. **Modular Separation**: Structure, behavior, and style in separate, predictable files
4. **API-Driven**: Every component manipulable via simple JSON/YAML operations
5. **Quality by Default**: Integrated UX/UI patterns ensure professional output
6. **Agent-Readable Documentation**: Exhaustive inline reference optimized for LLM context windows

## Why ADX?

Traditional frameworks (React, Vue, Svelte) were designed for human developers. They include:
- Verbose JSX/template syntax (high token cost)
- Implicit reactivity (hard for agents to reason about)
- Mixed concerns (harder to manipulate programmatically)
- Human-centric documentation (not optimized for agent context)

ADX inverts these assumptions.

## Quick Example

```
// Traditional React (estimated ~450 tokens for agent to modify)
// ADX equivalent (estimated ~180 tokens for agent to modify)
```

See `docs/comparison.md` for detailed analysis.

## Framework Structure

```
component-name/
  ├── structure.adx      # DOM structure (compact HTML-like)
  ├── behavior.adx.js    # Logic (pure functions)
  ├── style.adx.css      # Styling (semantic tokens)
  └── manifest.json      # Component metadata & API
```

## Build & Compile

This repo **is** the ADX compiler — a single npm package (`adx`), TypeScript,
Node >= 18. Everything runs from the repo root. It compiles a single component, or
a whole page that composes several components, to static HTML + scoped CSS + a
hydration-only glue script.

Build it:

```bash
npm install
npm run build        # tsc -> dist/
npm test             # Vitest suites
npm run lint
npm run benchmark    # measured ADX-vs-React token comparison (dev-only)
```

Compile a component (the bundled UserCard fixture — `name` is required, so pass
data):

```bash
echo '{ "name": "Ada Lovelace" }' > /tmp/user-card.json
node dist/cli.js build fixtures/user-card --data /tmp/user-card.json --out dist
# -> dist/user-card/{index.html, style.css, glue.js, behavior.js}
```

Compile a two-page composed site:

```bash
node dist/cli.js build fixtures/site/index.json --out dist   # -> dist/index.html
node dist/cli.js build fixtures/site/about.json --out dist   # -> dist/about/index.html
```

Validate without emitting files:

```bash
node dist/cli.js check fixtures/user-card --data /tmp/user-card.json  # "OK", exit 0; [ADX] + exit 1 on failure
node dist/cli.js check fixtures/site/about.json                       # validates every page instance
```

Once the package is published to npm (not yet — `0.1.0-alpha`), a global
`npm install -g adx` will expose the same commands as `adx build ...` /
`adx check ...`.

Options: `--out <dir>` (default `dist`), `--tokens <path>` (default
`tokens/design-tokens.json`), and `--data <file.json>` for a single-component
build. Interpolations resolve at build time, so the HTML contains the real content
with zero `{{ }}` left — the SEO contract. To emit real content the compiler runs
each component's `setup()` at build time inside a hardened sandbox (no
`require`/`fs`/network/`process`, timed) — see `docs/architecture.md`.

> Dispatch: a `.json` arg is a page build; a directory with `manifest.json` is a
> single-component build. `dev`, `create`, `tokens`, and `pattern` are still
> planned. See the Development Roadmap below.

## Documentation

- **For AI Agents**: Start with `docs/agent-reference.md`
- **For Humans**: Start with `docs/human-guide.md`
- **Architecture**: See `docs/architecture.md`
- **Grammar**: See `docs/adx-grammar.md`
- **Token Analysis**: See `docs/token-efficiency.md`
- **Roadmap / Next Steps**: See `docs/roadmap.md`

## Status

**Version**: 0.1.0-alpha  
**Target Release**: Q1 2027

**Shipped — Milestone 2**: real data binding (fills content from supplied data via
`--data` + sandboxed build-time `setup()`), multi-component pages, component
composition + slots, a defined per-instance reactivity contract, and a measured
token benchmark. **Next up**: a pattern library, dev server + hot reload, the
`create`/`tokens`/`pattern` CLI, and `sitemap.xml`/`robots.txt`. Full detail in
[`docs/roadmap.md`](docs/roadmap.md).

## Development Roadmap

| Component | Status | Priority |
|-----------|--------|----------|
| Core Documentation | ✅ Complete | High |
| Architecture Specification | ✅ Complete | High |
| Token Efficiency Analysis | ✅ Complete | High |
| Framework Comparison | ✅ Complete | Medium |
| Compiler Implementation | 🚧 In Progress (M1 + M2: data binding, pages, composition, reactivity on top of M1 codegen) | High |
| Design Token System | ✅ Complete (`tokens/design-tokens.json` + loader) | High |
| Data Binding (`--data` + sandboxed `setup()`) | ✅ Complete (M2) | High |
| Pages (multi-component `index.html`) | ✅ Complete (M2) | High |
| Component Composition + Slots | ✅ Complete (M2) | High |
| Reactivity Contract | ✅ Complete (M2, per-instance patch model) | High |
| Measured Token Benchmark | ✅ Complete (`npm run benchmark`) | Medium |
| Pattern Library | ❌ Not Started | High |
| CLI Tool | 🚧 In Progress (`adx build`/`check` for components and pages, `--data`; `dev`/`create`/`tokens`/`pattern` planned) | High |
| Example Components | ✅ Complete (UserCard + a two-page composed `fixtures/site/`) | Medium |
| Build System | 🚧 In Progress (`adx build` emits per-component HTML/CSS/glue/behavior, and per-page composed output) | High |
| Sitemap / robots.txt | ❌ Not Started | Medium |
| Dev Server (Hot Reload) | ❌ Not Started | Medium |
| Testing Framework | ❌ Not Started | Medium |
| VS Code Extension | ❌ Not Started | Low |
| Browser DevTools | ❌ Not Started | Low |

---

*"Make it cheap for AI. Make it beautiful for humans."*
