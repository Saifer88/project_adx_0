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
npm install -g project-adx-0
adx init my-app
cd my-app
adx check index.json
adx build index.json
adx serve dist
```

Open the printed URL (by default `http://localhost:3000/`). Edit the files in
`hello-card/` and the page metadata/data in `index.json`, then run
`adx check index.json` and `adx build index.json` again and refresh the browser. `serve`
only serves compiled files; it does not rebuild or hot reload. Stop it with Ctrl+C.

### Without a Global Install

Use this alternative in a fresh directory. Because the package and binary names
differ, pass the package with `--package` on every invocation:

```bash
npx --yes --package project-adx-0 adx init my-app
cd my-app
npx --yes --package project-adx-0 adx check index.json
npx --yes --package project-adx-0 adx build index.json
npx --yes --package project-adx-0 adx serve dist
```

**Trust boundary:** both `build` and `check` execute component JavaScript.
Only compile trusted components. Node `vm` and its timeout are not a security
sandbox; untrusted builds need an externally isolated environment with restricted
filesystem, network, credentials, and resources.

## Build With an AI Agent

Give your agent your frontend requirements and this starting instruction:

```text
Build my frontend using ADX (npm package: project-adx-0).
Read https://github.com/Saifer88/project_adx_0/blob/main/docs/agent-reference.md first.
Work in my app project, not the ADX framework repository. Use the installed CLI.
Create or edit components, page manifests, and design tokens. Do not modify
the ADX compiler, CLI, installed package, or generated dist output.
Use only implemented APIs. Run adx check, build the pages, and preview them
with adx serve. Verify layout and interactions in a browser.
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
	tokens/design-tokens.json
	dist/                    Generated output; do not edit
```

`dist/` appears after building. Add components and page manifests as your frontend
grows. Edit source files, check, build, and refresh the preview.

## CLI

| Command | Purpose |
| :--- | :--- |
| `adx init [name]` | Create a starter in a named directory or the current directory; never overwrites scaffold files. |
| `adx check <componentDir\|page.json>` | Validate in memory; exits 0 on success or 1 with an `[ADX]` error. |
| `adx build <componentDir\|page.json>` | Generate static HTML, scoped CSS, and hydration JavaScript. |
| `adx serve [dir]` | Preview compiled output; defaults to `dist`. No compilation or hot reload. |
| `adx tokens` | List design tokens grouped by category. |
| `adx help` | Show all commands and flags. |

```bash
adx build index.json --out dist --tokens tokens/design-tokens.json
adx build styled.json --site site.json   # merge shared external assets (Tailwind, etc.)
adx check hello-card --data sample-data.json
adx serve dist --port 3000 --host localhost
adx tokens --tokens tokens/design-tokens.json
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
after its own token stylesheet (so utilities can override via cascade), keeping
the page fully styled and crawlable with no JavaScript. Do not inject a runtime
CSS CDN `<script>` into a component — it breaks the static/SEO contract. See the
[AI Frontend Guide](docs/agent-reference.md#external-design-library-assets).

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
| Per-instance text and attribute updates | Runtime structural and computed reactivity |
| External CSS/JS assets (Tailwind etc.) via page `assets` + `--site` | Asset replace-semantics and site-config auto-discovery |

`:if`/`:for` and computed values are build-time only. See the
[reactivity contract](docs/agent-reference.md#reactivity-contract) before designing
dynamic interactions, and the [roadmap](docs/roadmap.md) for planned features.

## Token Efficiency

Token-first authoring is the design goal. **Measured today: 13.3-13.8% fewer
source-reading tokens** on one UserCard versus a minimal React equivalent.
Full-workflow savings are not measured; 60-80% is a target, not a demonstrated
result. See the [benchmark methodology](https://github.com/Saifer88/project_adx_0/blob/main/benchmark/README.md).

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
