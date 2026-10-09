# ADX Framework

**Agent-Driven Experience Framework**

![SEO Friendly](https://img.shields.io/badge/SEO-friendly-brightgreen)
![Token Efficient](https://img.shields.io/badge/AI-token--efficient-blue)

## Mission Statement

**Primary Goal**: Minimize token consumption for AI coding agents while maintaining human comprehensibility.

**Design Principle**: Every design decision prioritizes agent efficiency first, human ergonomics second. This is not negotiable and guides every evolution of the framework.

## What is ADX?

ADX is a frontend framework built from the ground up for AI coding agents. It reduces token overhead by 60-80% compared to traditional frameworks while producing production-quality interfaces that never look "AI-generated" or incomplete.

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
Node >= 18. Everything runs from the repo root. Milestone 1 compiles a single
component to static HTML + scoped CSS + a hydration-only glue script.

Build it:

```bash
npm install
npm run build        # tsc -> dist/
npm test             # 77 Vitest tests
npm run lint
```

Compile a component (the bundled UserCard fixture):

```bash
node dist/cli.js build fixtures/user-card --out dist
# -> dist/user-card/{index.html, style.css, glue.js, behavior.js}
```

Validate without emitting files:

```bash
node dist/cli.js check fixtures/user-card    # prints "OK", exits 0; [ADX] error + exit 1 on failure
```

Once the package is published to npm (not yet — `0.1.0-alpha`), a global
`npm install -g adx` will expose the same commands as `adx build ...` /
`adx check ...`.

Options: `--out <dir>` (default `dist`), `--tokens <path>` (default
`tokens/design-tokens.json`). The output folder is the component directory's
basename (e.g. `user-card`). Interpolations resolve at build time, so
`index.html` contains the real content with zero `{{ }}` left — the SEO contract.

> M1 scope: single-component `build`/`check` only. `dev`, `create`, `tokens`, and
> `pattern` are planned. See the Development Roadmap below.

## Documentation

- **For AI Agents**: Start with `docs/agent-reference.md`
- **For Humans**: Start with `docs/human-guide.md`
- **Architecture**: See `docs/architecture.md`
- **Grammar**: See `docs/adx-grammar.md`
- **Token Analysis**: See `docs/token-efficiency.md`

## Status

**Version**: 0.1.0-alpha  
**Target Release**: Q1 2027

## Development Roadmap

| Component | Status | Priority |
|-----------|--------|----------|
| Core Documentation | ✅ Complete | High |
| Architecture Specification | ✅ Complete | High |
| Token Efficiency Analysis | ✅ Complete | High |
| Framework Comparison | ✅ Complete | Medium |
| Compiler Implementation | 🚧 In Progress (M1 complete: parse/validate + codegen emit static HTML/CSS/glue) | High |
| Design Token System | ✅ Complete (`tokens/design-tokens.json` + loader) | High |
| Pattern Library | ❌ Not Started | High |
| CLI Tool | 🚧 In Progress (`adx build` + `adx check` landed; `dev`/`create`/`tokens`/`pattern` planned) | High |
| Example Components | 🚧 In Progress (UserCard compiles end-to-end to HTML/CSS/glue) | Medium |
| Build System | 🚧 In Progress (M1 `adx build` emits `index.html` + `style.css` + `glue.js` + `behavior.js` under `dist/<name>/`) | High |
| Dev Server (Hot Reload) | ❌ Not Started | Medium |
| Testing Framework | ❌ Not Started | Medium |
| VS Code Extension | ❌ Not Started | Low |
| Browser DevTools | ❌ Not Started | Low |

---

*"Make it cheap for AI. Make it beautiful for humans."*
