# ADX Framework

*"Created by AI. For AI. Humans will understand."*

**Agent-Driven Experience Framework**

ADX is a frontend framework built specifically for AI coding agents to minimize token consumption while maintaining production-quality interfaces.

## Core Philosophy
**Token-First Design**: Every decision prioritizes AI agent efficiency first, human ergonomics second. The goal is a 60-80% token reduction across full agent workflows.

**Measured today:** 13.3-13.8% fewer source-reading tokens on one UserCard versus
a minimal React equivalent. Full-workflow savings are not measured yet; 60-80%
is a target, not a demonstrated result. See [benchmark/README.md](benchmark/README.md).

## Install

The npm package is **`project-adx-0`**; the CLI command it installs is **`adx`**.

```bash
# Global install -> an `adx` command on your PATH
npm install -g project-adx-0
adx build fixtures/user-card --data fixtures/user-card/data.json --out dist

# No install (one-off). The bin name (`adx`) differs from the package name,
# so pass the package with -p and the binary name after it:
npx -p project-adx-0 adx build fixtures/user-card --data fixtures/user-card/data.json --out dist
```

The package publishes to npm automatically from `main` via GitHub Actions
(see [`.github/workflows/publish.yml`](.github/workflows/publish.yml)); each push
to `main` publishes only when `package.json`'s version is not already on npm.

### Publishing setup (maintainers)

The publish workflow authenticates to npm with a repository secret named
`NPM_TOKEN`. Create it once:

1. **Create the npm token.** Sign in at [npmjs.com](https://www.npmjs.com/),
   open **Access Tokens** from your avatar menu, and choose **Generate New
   Token**. Pick a token that can publish:
   - **Granular Access Token** (recommended): scope it to the `project-adx-0`
     package with **Read and write** permission, and set an expiry.
   - Or a classic **Automation** token, which bypasses 2FA so CI can publish
     non-interactively.
2. **Copy the token value.** npm shows it only once. Treat it like a password —
   do not paste it into code, commits, or chat.
3. **Add it as a GitHub Actions secret.** In the GitHub repo, go to
   **Settings → Secrets and variables → Actions → New repository secret**, name
   it exactly `NPM_TOKEN`, paste the token value, and save.

After that, pushing to `main` runs the workflow and publishes when the version
is new. To release a new version, bump `version` in `package.json` and push to
`main`; re-pushing an already-published version is a clean skip. Rotate the
token by generating a new one on npm and updating the `NPM_TOKEN` secret.

## CLI

```bash
adx build <componentDir|page.json> [--out dist] [--tokens <path>] [--data <file.json>]
# Compile a component or a page to static HTML + scoped CSS + hydration glue.

adx serve [dir] [--port 3000] [--host localhost]
# Preview already-compiled output locally. Static file server only; it does
# NOT compile. `dir` defaults to `dist`. Prints the URL to open.

adx check <componentDir|page.json> [--tokens <path>] [--data <file.json>]
# Validate in-memory (prints OK and exits 0, or an [ADX] error and exits 1).
```

### End-to-end example

```bash
npm install -g project-adx-0

# Build the user-card fixture into dist/
adx build fixtures/user-card --data fixtures/user-card/data.json --out dist

# Serve the result and open the printed URL (http://localhost:3000/)
adx serve dist/user-card
```

## Quick Start (from source)

### Build & Validate
```bash
npm ci
# Build a component
npm run build
node dist/cli.js build fixtures/user-card --data fixtures/user-card/data.json --out dist/site

# Build a page
node dist/cli.js build fixtures/site/index.json --out dist/site

# Preview a build locally (static server; does not compile)
node dist/cli.js serve dist/site

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
- **Next**: Pattern library and a dev server with hot reload.

Available: typed props/defaults, static composition and slots, scoped CSS,
per-instance text/attribute updates, hydration assets for both pages and
standalone composed components, and a static `adx serve` for local preview.
`:if`/`:for` and computed values are build-time only. Lifecycle execution,
`@adx/patterns`, scaffolding and hot reload are not implemented.

See [`docs/roadmap.md`](docs/roadmap.md) for the full plan.
