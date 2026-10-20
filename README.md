<h1 align="center">ADX Framework</h1>

<p align="center"><em>Created by AI. For AI. Humans will understand.</em></p>

<p align="center"><strong>Target: 60-80% fewer tokens across full AI agent workflows.</strong><br>A design goal, not a demonstrated result. <a href="#token-efficiency">Current measurements and methodology</a>.</p>

<p align="center"><strong>Agent-Driven Experience</strong><br>Build frontends with AI. Ship HTML, CSS, and JavaScript.</p>

<p align="center">
	<a href="https://www.npmjs.com/package/project-adx-0"><img src="https://img.shields.io/badge/status-alpha-007F73?style=flat-square" alt="Status: alpha"></a>
	<a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18-417E38?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js 18 or newer"></a>
	<a href="docs/agent-reference.md"><img src="https://img.shields.io/badge/AI-frontend_guide-1769AA?style=flat-square" alt="AI frontend authoring guide"></a>
</p>

<p align="center">
	<a href="#quick-start">Quick Start</a> &middot;
	<a href="#build-with-an-ai-agent">Build With AI</a> &middot;
	<a href="#your-project">Project Structure</a> &middot;
	<a href="#documentation">Documentation</a>
</p>

ADX is an alpha frontend framework designed for AI-assisted authoring. Write compact
components and page manifests; ADX compiles them to static HTML, scoped CSS, and
JavaScript for supported interactions.

| Explicit Components | Static HTML First | Focused Edits |
| :--- | :--- | :--- |
| Separate structure, behavior, style, and contract. | Page content is rendered at build time. | Change the relevant file without rewriting the component. |

> **Building a frontend with an AI agent?** Start with the
> [AI Frontend Guide](docs/agent-reference.md)
> ([online copy](https://github.com/Saifer88/project_adx_0/blob/main/docs/agent-reference.md)).
> Use ADX as a dependency in your app. You do not need to clone or modify the
> ADX CLI/compiler repository.

## Quick Start

The npm package is **`project-adx-0`**; the CLI command it installs is **`adx`**.
Requires Node.js 18+ and npm; Node.js 24 LTS is recommended for new projects.
No repository clone or fixtures are needed.

```bash
npx --yes --package project-adx-0 adx init my-app
cd my-app
npm install
npm run check
npm run build
npm run serve
```

Open the printed URL (by default `http://localhost:3000/`). Edit the files in
`hello-card/` and the page metadata/data in `index.json`, then run
`npm run check` and `npm run build` again and refresh the browser. `serve`
only serves compiled files; it does not rebuild or hot reload. Stop it with Ctrl+C.

### Share or clone the project

`init` creates a private npm project with `project-adx-0` pinned to the generating
CLI's exact version as a development dependency. It does not run npm or access
the network itself. Commit the generated source and `package.json`, plus the
`package-lock.json` produced by the first install. Do not commit `node_modules/`
or `dist/`; the starter's `.gitignore` excludes them.

```bash
# After cloning, from the project root:
npm install
npm run check
npm run build
npm run serve
```

No global ADX installation is needed. Use `npm ci` in CI once the lockfile is
committed; include development dependencies for build/check. For commands not
covered by scripts, use `npx adx ...` after installing locally. A global
`npm install -g project-adx-0` followed by `adx init my-app` remains supported,
but the generated project still uses its own local dependency.

**Trust boundary:** both `build` and `check` execute component JavaScript.
Only compile trusted components. Node `vm` and its timeout are not a security
sandbox; untrusted builds need an externally isolated environment with restricted
filesystem, network, credentials, and resources.

## Build With an AI Agent

`adx init` generates a root `AGENTS.md`. Commit it with the app: it sets Caveman
ultra as the default chat style, with concise fallback rules when the skill is
unavailable. Code, docs, and UI copy remain in normal prose; requests for detail
or normal chat take precedence.

It also keeps work in application source rather than the ADX compiler, CLI,
installed package, or generated output. If the local CLI is missing, the agent
is instructed to run `npm install`, preserving the declared version. Only when
the dependency is absent should it add `project-adx-0` as an exact dev dependency.
No global CLI or Caveman installation is required.

These are project instructions, not runtime enforcement. Clients must support
and load `AGENTS.md`; otherwise ask the agent to read it explicitly. Give your
agent your frontend requirements and this starting instruction:

```text
Build my frontend using ADX (npm package: project-adx-0).
Follow AGENTS.md. Ensure the local CLI is installed, then read
node_modules/project-adx-0/docs/agent-reference.md.
Work in this app and use supported APIs. Verify layout and interactions in a browser.
```

The canonical guide also ships in the npm package at `docs/agent-reference.md`.
Use that copy for instructions matching the installed release; the online copy
tracks `main`. See the guide for local and global installation paths.

## Your Project

```text
my-app/
	hello-card/
		manifest.json          Component props, events, and slots
		structure.adx          Markup and bindings
		behavior.adx.js        Setup and synchronous event handlers
		style.adx.css          Styles using design tokens
	index.json               Page metadata and component data
	package.json             Pinned ADX dependency and npm scripts
	package-lock.json        Created by npm install; commit it
	.gitignore               Excludes dependencies and build output
	AGENTS.md                AI defaults, app boundaries, and CLI setup
	tokens/design-tokens.json
	node_modules/            Installed dependencies; do not edit
	dist/                    Generated output; do not edit
```

`dist/` appears after building. Add components and page manifests as your frontend
grows. Edit source files, check, build, and refresh the preview.

## CLI

| Command | Purpose |
| :--- | :--- |
| `adx init [name]` | Create an npm-ready starter with a pinned local ADX dependency; never overwrites scaffold files. |
| `adx create <component-name>` | Scaffold one new four-file component into the current project; never overwrites. |
| `adx check <componentDir\|page.json>` | Validate in memory; exits 0 on success or 1 with an `[ADX]` error. |
| `adx build <componentDir\|page.json>` | Generate static HTML, scoped CSS, and hydration JavaScript. |
| `adx serve [dir]` | Preview compiled output; defaults to `dist`. No compilation or hot reload. |
| `adx tokens` | List design tokens grouped by category. |
| `adx help` | Show all commands and flags. |

```bash
npx adx build index.json --out dist --tokens tokens/design-tokens.json
npx adx build styled.json --site site.json   # merge shared external assets (Tailwind, etc.)
npx adx check hello-card --data sample-data.json
npm run serve -- --port 3000 --host localhost
npx adx tokens --tokens tokens/design-tokens.json
```

`sample-data.json` is your JSON props file, not a generated starter file.
Both `build` and `check` accept `--tokens` and `--data`; `--data` supplies props
for standalone components. Pages supply data through their component entries, and
accept `--site <site.json>` to merge shared external assets.

### Using Tailwind or any CSS library

A page brings in external CSS/JS through an `assets` block — on the page manifest
or a shared `site.json` applied with `--site`:

```json
{ "assets": { "css": ["/tailwind.css"], "head": ["<meta name=\"theme-color\" content=\"#1d4ed8\" />"] } }
```

The recommended Tailwind path is **build-time static CSS**: run the Tailwind CLI
to generate `tailwind.css`, then reference it via `assets.css`. ADX links it right
after its own stylesheet, keeping styling independent of JavaScript. Loading
last does **not** guarantee overrides: scoped, unlayered ADX styles outrank normal
Tailwind v4 utilities. Use literal `class="..."` attributes and avoid competing
declarations, or explicitly opt into important utilities. Do not inject the
Play CDN runtime into a component. Follow the
[Tailwind v4 recipe](docs/agent-reference.md#external-design-library-assets).

## Documentation

| Goal | Guide |
| :--- | :--- |
| **Build a frontend with AI** | [AI Frontend Guide](docs/agent-reference.md) |
| Learn ADX as a developer | [Human Guide](docs/human-guide.md) |
| Look up exact syntax | [Grammar](docs/adx-grammar.md) |
| Understand compiler internals | [Architecture](docs/architecture.md), for contributors |
| Publish the framework | [Publishing](docs/publishing.md), for maintainers |

## Status and Limits

**Version: `0.1.0-alpha`.** APIs are early-stage; assess the current limits before
choosing ADX for your frontend.

| Available | Not Yet Available |
| :--- | :--- |
| Project scaffolding and static preview | Hot reload and a compiling dev server |
| Typed props, defaults, composition, and slots | Framework pattern library and lifecycle execution |
| Per-instance text/attribute updates, incl. single bare computed values | Runtime structural reactivity and computed member chains/mixed templates |
| External CSS/JS assets (Tailwind etc.) via page `assets` + `--site` | Asset replace-semantics and site-config auto-discovery |
| `sitemap.xml` + `robots.txt` on a site `baseUrl` (per build) | Multi-page sitemaps, `lastmod`/`priority`, sitemap index files |

`:if`/`:for` are build-time only; a single bare computed reference
(`{{displayName}}`, `:title="displayName"`) live-patches on handler return while
computed member chains and mixed templates stay build-time only. See the
[reactivity contract](docs/agent-reference.md#reactivity-contract) before designing
dynamic interactions, and the [roadmap](docs/roadmap.md) for planned features.

## Token Efficiency

Token-first authoring is the design goal. UserCard measures **13.3-13.8% fewer
source-reading tokens** versus minimal React. A runnable support portal now adds
five routes and shared desktop/mobile acceptance checks. Its selected reading
tasks range from **7.9% more tokens to 60.6% fewer**; the complete portal read
costs ADX **4.0% more**. These are file-reading costs, not measured workflow savings.
The 60-80% full-workflow target remains unverified.

```bash
npm run benchmark       # reproduce all source-reading results
npm run benchmark:app   # build equivalent ADX and prerendered React portals
node dist/cli.js serve benchmark/app/dist/adx   # or benchmark/app/dist/react
```

See the [benchmark methodology and workflow protocol](benchmark/README.md).

## Contributing to ADX

This section is for changing the framework itself, **not building an app with it**.
Frontend authors can stop at the guides above.

<details>
<summary>Contributor setup and validation</summary>

Clone this repository and run these commands from its root. Use Node 22.13+
(22.x) or Node 24+ for framework development.

```bash
npm ci
npm run build
node dist/cli.js check fixtures/user-card --data fixtures/user-card/data.json
node dist/cli.js build fixtures/site/index.json --out dist/site
node dist/cli.js serve dist/site
```

Validation: `npm test`, `npm run lint`, and `npm run benchmark`. Browser tests:
`npx playwright install chromium`, then `npm run test:browser`.

Compiler details are in [Architecture](docs/architecture.md); release instructions
are in [Publishing](docs/publishing.md).

</details>
