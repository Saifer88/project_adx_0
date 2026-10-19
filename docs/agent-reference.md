# ADX AI Frontend Guide

**Use ADX to build the user's frontend.** This is the canonical, token-efficient
guide for application authors, not instructions for developing the ADX framework.

## Work in the App, Not the Framework

- Use the installed `adx` CLI in the user's app directory. Do not clone the ADX
  repository or run its contributor setup to create a frontend.
- Create and edit app components (`manifest.json`, `structure.adx`,
  `behavior.adx.js`, `style.adx.css`), page manifests, assets, and design tokens.
- Treat the CLI/compiler as a dependency. Do not modify ADX source, its installed
  package, or generated `dist/` files unless the user explicitly requests framework
  development. Rebuild generated output from app source instead.
- Use implemented APIs only. If a requested interaction exceeds ADX's limits,
  explain the limitation and agree on an alternative; do not silently add a
  compiler feature or switch frameworks.

## Install and First Page

Requires Node.js 18+ and npm; Node.js 24 LTS is recommended for new projects.
The npm package is `project-adx-0`; its executable is `adx`.

```bash
npm install -g project-adx-0
adx init my-app
cd my-app
adx check index.json
adx build index.json
adx serve dist
```

Open the printed URL (default `http://localhost:3000/`). No repository clone is
needed. Without a global install, replace **every** `adx` invocation with
`npx --yes --package project-adx-0 adx`; keep the `cd my-app` step.
For an existing app, inspect its files first; do not run `init` over existing work.

`init` creates `hello-card/`, `index.json`, tokens, and a README. Read the
component's `manifest.json` first, then edit the relevant structure, behavior,
or style file. Edit page metadata and component data in `index.json`. After
each change, run `adx check index.json`, then `adx build index.json`, and
refresh the browser. `serve` is static only, with no rebuild or hot reload;
stop it with Ctrl+C. `check` validates compilation, not browser interactions.
Verify the frontend at desktop and mobile sizes and exercise its interactions.

Both `check` and `build` execute component JavaScript. Compile only trusted
components; the Node VM is not a security sandbox.

This reference ships inside the npm package at `docs/agent-reference.md`.
For a local install it is at `node_modules/project-adx-0/docs/agent-reference.md`;
for a global install, find the package under the directory printed by `npm root -g`.
The [online reference](https://github.com/Saifer88/project_adx_0/blob/main/docs/agent-reference.md)
tracks `main`; the packaged copy matches your installed release.

## Current Capabilities

Implemented: `build`/`check`/`serve`/`init`/`tokens`/`help`, typed props/defaults, static
pages/composition/slots, scoped CSS, per-instance text/attribute updates, and
standalone child assets. `serve` is a static preview server only (no compile);
`init` scaffolds a minimal, buildable starter project.
Not implemented: `@adx/patterns`, lifecycle execution, a dev server
with hot reload, automatic accessibility audits, or structural/computed reactivity.
Future API sketches live separately in [Planned Patterns](./planned-patterns.md);
do not use them in current components.
Both `build` and `check` execute trusted component code; `node:vm` is not a
security boundary. See the build-time execution section before compiling dependencies.

## Quick Reference Card

```
COMPONENT CREATION
  Fast path (new project):  adx init [name]  -> starter component + page + tokens
  By hand:
  1. mkdir component-name
  2. Create 4 files: structure.adx, behavior.adx.js, style.adx.css, manifest.json
  3. Define props in manifest.json first
  4. Build structure.adx (refer to props)
  5. Add behavior.adx.js (deterministic setup, synchronous handlers)
  6. Style with tokens in style.adx.css

COMPONENT MODIFICATION
  1. Read manifest.json (understand contract)
  2. Identify concern: structure/behavior/style
  3. Edit only relevant .adx file
  4. Update manifest.json if API changed
  5. Run adx check <page.json>, then adx build <page.json>
```

## Runnable Component Example

After the quick start, create a `counter/` directory beside `index.json` and put
these four files in it. All props have defaults, so no data file is needed.

### manifest.json
```json
{
  "name": "Counter",
  "version": "1.0.0",
  "props": {
    "title": { "type": "string", "default": "Counter" },
    "initialCount": { "type": "number", "default": 0 }
  },
  "emits": ["changed"],
  "slots": []
}
```

### structure.adx
```adx
<section .counter>
  <h1>{{title}}</h1>
  <p aria-live="polite">Clicks: {{count}}</p>
  <button type="button" @click="onIncrement">Increment</button>
</section>
```

**Syntax**:
- `.className` = class binding (shorthand)
- `:prop` = property binding (shorthand)
- `{{var}}` = text interpolation
- `<slot name />` = content slot

### behavior.adx.js
```js
export function setup(props) {
  return { title: props.title, count: props.initialCount }
}

export function onIncrement(state) {
  state.count += 1
  emit('changed', { count: state.count })
}
```

**Rules**:
- Keep setup deterministic; event handlers may mutate their own state
- `setup()` required, returns initial state
- Event handlers: `on{EventName}(state, event)`
- Use `emit(name, data)` for custom events

### style.adx.css
```css
@use tokens;

.counter {
  display: grid;
  pad: tokens.space-6;
  gap: tokens.space-2;
  bg: tokens.surface-0;
  color: tokens.text-1;
  font-family: tokens.font-sans;
}

button {
  min-height: tokens.space-12;
  pad: tokens.space-2 tokens.space-4;
  bg: tokens.primary;
  color: tokens.surface-0;
  radius: tokens.radius-sm;
  size: tokens.text-base;
  weight: tokens.weight-medium;
  border: none;
}
```

From the project directory, run:

```bash
adx check counter
adx build counter
adx serve dist
```

Open `/counter/` on the printed server URL. If `serve` is already running,
reuse it. Clicking Increment updates the count for this instance. To place the
counter on your home page instead, replace the starter entry in `index.json`'s
`components` array with
`{ "use": "./counter", "data": { "title": "Counter", "initialCount": 0 } }`,
then check and build `index.json` again.

**Abbreviated Properties**:
- `pad` = padding
- `bg` = background
- `radius` = border-radius
- `size` = font-size
- `weight` = font-weight

## Design Tokens

Available via `@use tokens`:

```css
/* Spacing (4px base scale) */
tokens.space-0    /* 0 */
tokens.space-1    /* 4px */
tokens.space-2    /* 8px */
tokens.space-3    /* 12px */
tokens.space-4    /* 16px */
tokens.space-6    /* 24px */
tokens.space-8    /* 32px */
tokens.space-12   /* 48px */
tokens.space-16   /* 64px */

/* Colors */
tokens.primary    /* Brand primary */
tokens.secondary  /* Brand secondary */
tokens.surface-0  /* Backgrounds (lightest) */
tokens.surface-1
tokens.surface-2
tokens.surface-3  /* Backgrounds (darkest) */
tokens.text-1     /* Primary text */
tokens.text-2     /* Secondary text */
tokens.text-3     /* Tertiary text */
tokens.border     /* Border color */
tokens.success
tokens.warning
tokens.error
tokens.info

/* Radius */
tokens.radius-sm   /* 4px */
tokens.radius-md   /* 8px */
tokens.radius-lg   /* 12px */
tokens.radius-full /* 9999px */

/* Shadows */
tokens.shadow-sm
tokens.shadow-md
tokens.shadow-lg

/* Typography */
tokens.text-xs    /* 12px */
tokens.text-sm    /* 14px */
tokens.text-base  /* 16px */
tokens.text-lg    /* 18px */
tokens.text-xl    /* 20px */
tokens.text-2xl   /* 24px */
tokens.text-3xl   /* 30px */

tokens.font-sans
tokens.font-serif
tokens.font-mono

tokens.weight-normal  /* 400 */
tokens.weight-medium  /* 500 */
tokens.weight-bold    /* 700 */

/* Breakpoints */
tokens.breakpoint-sm  /* 640px */
tokens.breakpoint-md  /* 768px */
tokens.breakpoint-lg  /* 1024px */
tokens.breakpoint-xl  /* 1280px */
```

## Common Modifications

### Add New Prop
1. Edit `manifest.json`, add to `props` object
2. Use prop in `structure.adx`: `:attrName="propName"` or `{{propName}}`
3. Handle in `behavior.adx.js` `setup()` if needed

### Add Event Handler
1. In `structure.adx`: `@click="onAction"`
2. In `behavior.adx.js`, export `onAction(state, event)` with exactly that name
3. For a custom event, call `emit('changed', data)` and add `"changed"` to the
  manifest's `emits` array; DOM events and handler names do not belong there

### Add Conditional Rendering
```adx
<div :if="condition">Shown when true</div>
<div :else>Shown when false</div>
```

### Add List Rendering
```adx
<div :for="item in items" :key="item.id">
  {{item.name}}
</div>
```

### Change Styling
- ADX styles: edit `style.adx.css`; use existing tokens (`adx tokens`) and
  abbreviations such as `pad`, `bg`, `radius`.
- Tailwind: edit literal `class="..."` attributes in `structure.adx`, then rebuild
  Tailwind CSS and the ADX page. See [external assets](#external-design-library-assets).

## Token Optimization Tips

1. **Read manifest.json first** before parsing component source
2. **Edit single file** per concern (don't read all 4 files unless needed)
3. **Reuse existing project components**; the framework pattern library is planned
4. **Reference this doc** for syntax (don't guess abbreviations)
5. **Emit minimal explanations** to user (code + 1 sentence)

## UX/UI Baseline (always apply)

Authors should apply this baseline. The compiler does not currently enforce it,
and the planned pattern library is not available.

```
A11Y   decorative icons aria-hidden; meaningful icons get text alt; icon-only
       controls get accessible name. Color never the only signal.
       Contrast: text >=4.5:1, large/non-text >=3:1, both themes.
       Fields: label + hint + inline error; multi-error -> focus summary.
       Focus order = visual order, never obscured. Drag/swipe has key alt.
       Respect reduced-motion + large text size.
INTER  pressed/hover feedback 80-150ms via color/opacity/elevation (no layout
       shift). Real disabled semantics. Semantic <button>/<a>, not <div>.
LAYOUT space-* tokens for all rhythm; mobile-first with breakpoint-* tokens;
       touch targets >=44px; readable text measure.
VISUAL one icon family, consistent stroke/fill, token-sized; vector only, no
       emoji icons; theme via surface-*/text-* tokens, no hardcoded hex.
MOTION subtle default; exit faster than enter; gate non-essential behind
       reduced-motion.
```

Follow the app's existing design system and accessibility requirements. Optional
design tools or agent skills are not prerequisites for using ADX.

## Error Messages

ADX provides concise, actionable errors:

```
[ADX] structure.adx:5 - Unknown prop "titel" (did you mean "title"?)
[ADX] manifest.json - Missing required field "name"
[ADX] style.adx.css:12 - Unknown token "tokens.space-5" (available: 0,1,2,3,4,6,8,12,16)
```

## Compilation

Grammar/AST contract: see [docs/adx-grammar.md](./adx-grammar.md) (parser's source of truth).

Run these commands from your app directory using the installed `adx` CLI
(package `project-adx-0`). You do not need the framework source tree.

```bash
# IMPLEMENTED
adx build <dir>  [--out dist] [--tokens <path>] [--data <file.json>]  # single component -> dist/<name>/
adx build <page.json> [--out dist] [--tokens <path>] [--site <site.json>]  # page -> dist/[<slug>/]index.html
adx check <dir>  [--tokens <path>] [--data <file.json>]               # validate a component in-memory
adx check <page.json> [--tokens <path>] [--site <site.json>]          # validate every page instance
adx init [name]                                                       # scaffold a starter project (./<name> or CWD)
adx serve [dir] [--port <n>] [--host <h>]                             # static-serve compiled output locally (no compile)
adx tokens [--tokens <path>]                                          # list all design tokens, grouped by category
adx help                                                              # print the full command listing (stdout, exit 0)
```

Future CLI proposals (`dev`, richer `create`/`pattern`) are tracked in the
[roadmap](./roadmap.md), not available commands.

Build output per component:

- `index.html` — complete static HTML; every `{{...}}`/`:prop` resolved at build
  time, `:if`/`:else`/`:for` applied, slots projected (standalone build leaves a
  `<slot data-adx-slot>` placeholder; a composed child's slot is filled). Owned
  elements carry `data-adx-c="<scopeId>"`; each instance root carries
  `data-adx-i="i<ordinal>"`; bound/event/interpolated nodes carry a stable
  three-part hook `data-adx-b="<scopeId>-i<ordinal>-<n>"`. Zero `{{` remain (SEO
  contract).
- `style.css` — `@use tokens;` stripped, abbreviated props expanded
  (`pad`→padding, `bg`→background, `radius`→border-radius, `size`→font-size,
  `weight`→font-weight, `shadow`→box-shadow, …), every `tokens.*` resolved, each
  selector scoped as `<sel>[data-adx-c="<id>"]`, `@media` passed through with
  `tokens.breakpoint-*` resolved to px.
- `glue.js` — hydration-only ES module: imports behavior exports from
  `./behavior.js`, loops over an `INSTANCES` array (one record per instance of the
  component on the page), and for **each** instance builds its own
  `setup(props) → state`, selects its root by `data-adx-c`+`data-adx-i`, wires
  each `@event` to its handler `(state, event)`, and patches that instance only.
  No vDOM, no `createElement`.
- `behavior.js` — `behavior.adx.js` copied verbatim (plain ESM); the glue's
  import target. Its exports are name-scanned at build time (for handler wiring),
  and `setup()`/`get*()` are **executed as trusted code in a Node VM context** at build time to
  compute real state (see Build-time `setup()` below).

`scopeId` is deterministic: `c` + first 7 hex of `sha256(name \0 location)`. For a
single-component build `location` is the directory basename (M1-stable); for page
and composed children it is the repo-relative POSIX path, so same-basename deps in
different folders never collide.

## Data binding — `--data <file.json>`

`--data` points at a JSON file whose top-level object is the props for a
single-component build, e.g. `{"name":"Ada Lovelace","role":"Engineer"}`. Props
are a three-layer merge: manifest `default`s, overlaid by `--data` (data wins per
key), then **required-prop validation**. A required prop with neither a default
nor a supplied value fails:

```
[ADX] manifest.json - Missing required prop "name" (no default and none supplied via --data)
```

Because `check` runs the same path, `adx check <dir>` without `--data` on a
component that has a required prop with no default now **fails** (by design — it
surfaces the SEO-breaking empty element). Check such a child via a page that uses
it, or pass sample `--data`.

### Build-time `setup()` (Trusted Code)

Both `build` and `check` run `setup()` and referenced `get*()` in a Node `vm`
context with a 1000ms execution timeout. Some globals are absent, but host objects
and constructor access can escape that context. It does not prevent filesystem,
network or process access by untrusted code. Compile only trusted components;
untrusted builds require external OS/container isolation, restricted credentials,
filesystem/network access and resource limits. A worker or child process alone
does not provide those restrictions.

The browser re-runs `setup()` with the same props: keep it deterministic and
synchronous. Imports, re-exports and default exports are unsupported. Acorn
parses named function/variable declarations; comments and strings are preserved.
The historical public `EXPORT_RE` export is retained for compatibility only.

Declared props and defaults must match their type; numbers must be finite,
`object` excludes arrays and null, and null is rejected for all declared types.
Undefined input is treated as absent (a default can still apply). Unknown props
are preserved for compatibility but are not type-validated.

Failure messages (all line-less, on `behavior.adx.js`):
`setup() failed: <message>`, `setup() exceeded time budget (1000ms)`,
`Missing required export "setup"`.

## Pages — `adx build <page.json>`

A page is a flat JSON manifest that composes components into one crawlable
`index.html` per URL. Dispatch is strict: a `.json` positional arg → page build; a
directory with `manifest.json` → component build; else
`[ADX] <path> - Not a component directory or page manifest`.

```json
{
  "page": "about",
  "title": "About us",
  "description": "Who we are and what ADX is.",
  "lang": "en",
  "canonical": "/about/",
  "schema": "AboutPage",
  "components": [
    { "use": "./components/site-header", "data": { "current": "about" } },
    { "use": "./components/user-card",   "data": { "name": "Ada Lovelace", "role": "Founder" } }
  ]
}
```

Field rules: `page` (required slug, `^[a-z0-9]+(?:-[a-z0-9]+)*$`; `index`/`home` →
root `/index.html`, else `<out>/<page>/index.html`), `title` + `description`
(required, drive `<title>`/meta/OG/Twitter), `lang` (default `en`), `canonical`
(default `/` for root else `/<page>/`), `schema` (optional schema.org `@type`;
emits JSON-LD `{"@context":"https://schema.org","@type":<schema>,"name":<title>}`),
`components` (required, non-empty; each `use` points at a component directory
relative to the page file — never another page), `assets` (optional external
CSS/JS/head; see below). Each instance's `data` is the same shape as a `--data`
file and is required-prop-validated with the page branch hint (`… no value in the
page's component data`). Sidecar files live beside the page (`about/style.css`,
`about/glue.js`, `about/<comp>.behavior.js`).

Per-page SEO comes from the page manifest. A standalone `adx build <dir>` keeps
M1-fixed SEO (`<html lang="en">`, root canonical); per-component SEO overrides are
a later milestone.

### External design-library assets

Pages only: declare `assets` on the page or in a shared `site.json`. Pass
`--site <path>` to **both** build/check; path is relative to CWD, never discovered.

```json
{ "assets": { "css": ["/tailwind.css"], "js": [{ "src": "/app.js", "type": "module" }] }, "lang": "en" }
```

- `css`: non-empty URL strings. `js`: non-empty URL strings or objects with
  required `src`, optional string `type`, boolean `defer`/`async`.
- `head`: raw HTML strings after CSS links; **trusted authors only**.
- Merge: site then page; CSS deduped by exact URL, JS by `src` (first wins,
  including flags); head not deduped. Language: page > site > `en`.
- URLs resolve against the **emitted document**, not the manifest. ADX never
  copies, generates or checks asset files. Put shared `/tailwind.css` at
  `dist/tailwind.css`; `./x.css` must sit beside that page's HTML. For subpath
  hosting, include the deployment prefix (e.g. `/my-app/tailwind.css`).
- External CSS follows ADX CSS; JS follows glue **in markup only**. Classic
  scripts can execute before glue; `async` is unordered. Hydration-dependent
  code should wait for `DOMContentLoaded`, not rely on tag placement.

**Tailwind v4 quick path** (after `adx init`, from the app root):

```bash
npm install -D tailwindcss@4 @tailwindcss/cli@4
mkdir -p styles
```

Create `styles/tailwind.css`:

```css
@import "tailwindcss" source("../");
```

Create `site.json` with `{"assets":{"css":["/tailwind.css"]}}`. Use literal
`class="p-2.5 md:grid hover:underline w-1/2"` in component markup; dot shorthand
rejects variants, fractions, decimals, arbitrary values and negative utilities.
Keep class names complete in scanned source, never concatenate fragments.
Tailwind skips ignored files and dependencies; add `@source` for those.

```bash
npx @tailwindcss/cli -i styles/tailwind.css -o dist/tailwind.css --minify
adx check index.json --site site.json
adx build index.json --site site.json
adx serve dist
```

**Cascade:** loading last does not guarantee overrides. ADX uses scoped,
unlayered rules; normal declarations outrank Tailwind v4's layered utilities.
Prefer utilities owning their properties without competing ADX declarations.
For intentional overrides, use v4 `p-2.5!` or opt the whole utility sheet into
`@import "tailwindcss" source("../") important;` (not ADX's default).
Tailwind Preflight is global; check existing components.

Rebuild both outputs after edits. ADX never runs Tailwind; **do not inject the
Play CDN runtime into components**. See [setup/troubleshooting](./human-guide.md#using-tailwind-or-any-css-library-with-adx)
and [asset schema/errors](./adx-grammar.md#12-pagesite-assets-schema-json-not-adx).

## Composition

Resolve a custom tag against the using component's `manifest.deps`; pass props
with `:prop`/plain attrs (evaluated against the parent scope); project content
with `<template slot="name">`. See grammar §11 for the full rules, error strings,
and ownership of projected nodes. Key points:

- `<slot actions />` declares a slot (child); `<slot name="actions"/>` is invalid.
- `<template slot="actions">` projects (parent); bare/non-template children →
  default slot. `#name` is planned sugar, parseable today, not yet wired.
- Projected nodes are **parent-owned** (parent `data-adx-c`/`data-adx-i`/hooks).
- The same component used N times → N independent instances, each with its own
  `data-adx-i`, hook ids, state, root, and event/emit/patch routing.
- A standalone `adx build <dir>` composes children into one component's output;
  full per-child behavior/glue sidecars are emitted for both standalone and page
  builds. Same-basename assets receive a stable scope-based suffix to avoid overwrites.

Each instance stores its own hooks, including when build-time branches differ.
Boolean HTML attributes are omitted for false/null/undefined; ARIA attributes
remain strings. Runtime updates also synchronize form `value`, `checked` and
`selected` properties. Loop descendants retain their build-time content.

## Reactivity contract

On a handler's return, the glue re-evaluates and patches **only** the affected
hooked nodes' text/attributes for **that instance** — no vDOM, no full re-render,
no `setup()` re-run. Limits (by design in M2):

- **No structural reactivity.** `:if`/`:else`/`:for` are build-time only; adding
  or removing nodes at runtime is not supported.
- **Computed-backed interpolations are not live-patched.** A run whose root
  identifier is a `get*` computed value (`{{displayName}}`, `{{displayName.foo}}`,
  `:src="displayName.url"`, or any mixed run containing one) is frozen at its
  build-time value — never blanked, never updated. Only `state`/`props`/loop-local
  refs live-patch.
- `:for`-unrolled nodes get events-only hooks (text/attrs frozen).
- The first patch after hydration is a no-op for a deterministic `setup()`.

---

*This reference is optimized for agent context windows.*
