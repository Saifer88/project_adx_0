# ADX Framework

**Agent-Driven Experience Framework**

## Mission Statement

**Primary Goal**: Minimize token consumption for AI coding agents while maintaining human comprehensibility.

**Design Principle**: Every design decision prioritizes agent efficiency first, human ergonomics second. This is not negotiable and guides every evolution of the framework.

## What is ADX?

ADX is a frontend framework built from the ground up for AI coding agents. It reduces token overhead by 60-80% compared to traditional frameworks while producing production-quality interfaces that never look "AI-generated" or incomplete.

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

## Documentation

- **For AI Agents**: Start with `docs/agent-reference.md`
- **For Humans**: Start with `docs/human-guide.md`
- **Architecture**: See `docs/architecture.md`
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
| Build System | 🚧 In Progress (M1 `adx build` emits `dist/<name>/index.html|style.css|glue.js|behavior.js`) | High |
| Dev Server (Hot Reload) | ❌ Not Started | Medium |
| Testing Framework | ❌ Not Started | Medium |
| VS Code Extension | ❌ Not Started | Low |
| Browser DevTools | ❌ Not Started | Low |

---

*"Make it cheap for AI. Make it beautiful for humans."*
