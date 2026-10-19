# ADX Framework

*"Created by AI. For AI. Humans will understand."*

**Agent-Driven Experience Framework**

ADX is a frontend framework built specifically for AI coding agents to minimize token consumption while maintaining production-quality interfaces.

## Core Philosophy
**Token-First Design**: Every decision prioritizes AI agent efficiency first, human ergonomics second. The goal is a 60-80% token reduction across full agent workflows.

**Measured today:** 13.3-13.8% fewer source-reading tokens on one UserCard versus
a minimal React equivalent. Full-workflow savings are not measured yet; 60-80%
is a target, not a demonstrated result. See [benchmark/README.md](benchmark/README.md).

## Quick Start

### Build & Validate
```bash
npm ci
# Build a component
npm run build
node dist/cli.js build fixtures/user-card --data fixtures/user-card/data.json --out dist/site

# Build a page
node dist/cli.js build fixtures/site/index.json --out dist/site

# Validate a component/page
node dist/cli.js check fixtures/user-card --data fixtures/user-card/data.json
node dist/cli.js check fixtures/site/index.json
```

For development, use Node 22.13+ (22.x) or Node 24+. Run `npm test`,
`npm run lint`, and `npm run benchmark`. Browser regression tests use
`npx playwright install chromium` followed by `npm run test:browser`.

**Trust boundary:** both `build` and `check` execute component JavaScript.
Only compile trusted components. Node `vm` and its timeout are not a security
sandbox; untrusted builds need an externally isolated environment with restricted
filesystem, network, credentials, and resources.

### Component Structure
Each component consists of 4 files:
- `structure.adx`: DOM structure (compact syntax)
- `behavior.adx.js`: Deterministic setup and synchronous state-mutating handlers
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

Available: typed props/defaults, static composition and slots, scoped CSS,
per-instance text/attribute updates, and hydration assets for both pages and
standalone composed components. `:if`/`:for` and computed values are build-time
only. Lifecycle execution, `@adx/patterns`, scaffolding and hot reload are not
implemented.

See [`docs/roadmap.md`](docs/roadmap.md) for the full plan.
