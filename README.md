# ADX Framework

*"Created by AI. For AI. Humans will understand."*

**Agent-Driven Experience Framework**

ADX is a frontend framework built specifically for AI coding agents to minimize token consumption while maintaining production-quality interfaces.

## Core Philosophy
**Token-First Design**: Every decision prioritizes AI agent efficiency first, human ergonomics second. The goal is a 60-80% token reduction across full agent workflows.

## Quick Start

### Build & Validate
```bash
# Build a component
npm run build
node dist/cli.js build fixtures/user-card --data data.json --out dist

# Build a page
node dist/cli.js build fixtures/site/index.json --out dist

# Validate a component/page
node dist/cli.js check fixtures/user-card
```

### Component Structure
Each component consists of 4 files:
- `structure.adx`: DOM structure (compact syntax)
- `behavior.adx.js`: Pure logic functions
- `style.adx.css`: Styling using semantic tokens
- `manifest.json`: Metadata & API definition

## Essential Guides

| Target | Starting Point | Description |
| :--- | :--- | :--- |
| **AI Agents** | [`docs/agent-reference.md`](docs/agent-reference.md) | Canonical token-efficient reference |
| **Humans** | [`docs/human-guide.md`](docs/human-guide.md) | Framework overview and usage |
| **Technical** | [`docs/architecture.md`](docs/architecture.md) | Compiler internals and SEO contract |
| **Grammar** | [`docs/adx-grammar.md`](docs/adx-grammar.md) | Exact `.adx` syntax rules |

## Status
- **Version**: `0.1.0-alpha`
- **Current Milestone**: Real data binding, multi-component pages, and reactivity contract.
- **Next**: Pattern library and dev server.

See [`docs/roadmap.md`](docs/roadmap.md) for the full plan.
