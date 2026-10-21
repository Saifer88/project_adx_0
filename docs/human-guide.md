# ADX Human Guide

Welcome! ADX might look different from frameworks you've used before. That's intentional - it's designed primarily for AI agents but built to remain human-readable.

## Why ADX Looks Different

Traditional frameworks (React, Vue, Svelte) were designed for human developers. ADX inverts that priority:

**Primary User**: AI coding agents  
**Secondary User**: Human developers

This means:
- Syntax is more compact (fewer tokens for AI)
- Files are separated (easier for AI to target)
- A reusable pattern library is planned (not implemented yet)
- Documentation is exhaustive (optimized for AI context windows)

Source-reading cost depends on the task. UserCard measures about 13-14% savings
versus minimal React; a runnable support portal ranges from 7.9% more tokens to
60.6% fewer, with ADX costing 4.0% more for a complete portal read. Run
`npm run benchmark` to reproduce. These do not measure editing or full workflows;
see [token efficiency](./token-efficiency.md) and the
[benchmark protocol](../benchmark/README.md).

## Quick Start

### Installation

```bash
npm ci
npm run build
node dist/cli.js build fixtures/user-card --data fixtures/user-card/data.json --out dist/site
node dist/cli.js check fixtures/site/index.json
```

Run these commands from this repository using Node 22.13+ (22.x) or Node 24+.
You can also install the published CLI with `npm install -g project-adx-0`
(which gives you the `adx` command). Use `adx init` to scaffold a fresh starter
project; `adx dev` (hot-reload dev server) is not available yet.

### Project Structure

```
my-app/
├── components/
│   ├── user-card/
│   │   ├── manifest.json      # Component API
│   │   ├── structure.adx      # HTML-like markup
│   │   ├── behavior.adx.js    # JavaScript logic
│   │   └── style.adx.css      # Scoped styles
│   └── ...
├── pages/
│   └── home/
│       └── ... (same structure)
├── tokens/
│   └── design-tokens.json     # Design system
└── adx.config.json            # Project config
```

### Your First Component

Let's create a user profile card:

**1. Create the directory**
```bash
mkdir components/user-card
cd components/user-card
```

**2. Define the API** (`manifest.json`)
```json
{
  "name": "UserCard",
  "version": "1.0.0",
  "props": {
    "name": { "type": "string", "required": true },
    "avatar": { "type": "string", "default": "/default.png" },
    "bio": { "type": "string", "default": "" },
    "role": { "type": "string", "default": "User" }
  },
  "emits": ["click", "follow"],
  "slots": ["actions"]
}
```

**3. Build the structure** (`structure.adx`)
```adx
<article .card @click="onClick">
  <img :src="avatar" :alt="name" .avatar>
  <div .content>
    <h2 .name>{{name}}</h2>
    <p .role>{{role}}</p>
    <p :if="bio" .bio>{{bio}}</p>
  </div>
  <slot actions .actions />
</article>
```

**4. Add behavior** (`behavior.adx.js`)
```js
export function setup(props) {
  return {
    name: props.name,
    avatar: props.avatar || '/default.png',
    bio: props.bio,
    role: props.role
  }
}

export function onClick(state, event) {
  emit('click', { 
    name: state.name,
    target: event.target 
  })
}

export function onFollowClick(state) {
  emit('follow', { name: state.name })
}
```

**5. Style it** (`style.adx.css`)
```css
@use tokens;

.card {
  display: flex;
  pad: tokens.space-4;
  bg: tokens.surface-0;
  radius: tokens.radius-lg;
  shadow: tokens.shadow-md;
  gap: tokens.space-4;
  cursor: pointer;
  transition: all 0.2s;
}

.card:hover {
  shadow: tokens.shadow-lg;
  transform: translateY(-2px);
}

.avatar {
  width: 64px;
  height: 64px;
  radius: tokens.radius-full;
  object-fit: cover;
}

.content {
  flex: 1;
}

.name {
  margin: 0 0 tokens.space-1;
  size: tokens.text-xl;
  weight: tokens.weight-bold;
  color: tokens.text-1;
}

.role {
  margin: 0 0 tokens.space-2;
  size: tokens.text-sm;
  color: tokens.text-2;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bio {
  margin: 0;
  size: tokens.text-base;
  color: tokens.text-2;
  line-height: 1.5;
}

.actions {
  display: flex;
  gap: tokens.space-2;
  align-items: center;
}
```

**6. Use it**
```adx
<user-card 
  :name="John Doe" 
  :avatar="/john.jpg"
  :bio="Full-stack developer"
  :role="Senior Engineer"
  @click="handleClick"
  @follow="handleFollow">
  <template slot="actions">
    <button @click="onFollowClick">Follow</button>
    <button>Message</button>
  </template>
</user-card>
```

> **Projecting into a slot** uses the plain `slot="name"` attribute, as above.
> The shorthand `#actions` is planned sugar — it already *parses* today, but M2
> wires only the `slot="name"` form, so use that for now.

## Understanding ADX Syntax

### Structure Files (`.structure.adx`)

ADX uses a compact HTML-like syntax:

**Class Shorthand**
```adx
<!-- Traditional -->
<div class="card"></div>

<!-- ADX -->
<div .card></div>
```

**Property Binding**
```adx
<!-- Traditional -->
<img v-bind:src="avatar">

<!-- ADX -->
<img :src="avatar">
```

**Text Interpolation**
```adx
<h1>{{title}}</h1>
<p>Hello, {{name}}!</p>
```

**Conditionals**
```adx
<div :if="isLoggedIn">
  Welcome back!
</div>
<div :else>
  Please log in
</div>
```

**Loops**
```adx
<ul>
  <li :for="item in items" :key="item.id">
    {{item.name}}
  </li>
</ul>
```

**Event Handlers**
```adx
<button @click="onSubmit">Submit</button>
<input @input="onInput" @focus="onFocus">
```

**Slots**
```adx
<!-- Define slot -->
<div .container>
  <slot header />
  <slot /> <!-- default slot -->
  <slot footer />
</div>

<!-- Use slot -->
<my-component>
  <template slot="header">
    <h1>Title</h1>
  </template>
  
  <p>Default content</p>
  
  <template slot="footer">
    <p>Footer</p>
  </template>
</my-component>
```

Project named-slot content with `<template slot="name">`. Anything that isn't a
`<template slot="…">` — a bare paragraph, or a `<template>` with no `slot` — fills
the default `<slot />`. (`#name` is reserved sugar for `slot="name"`, parseable
today but not yet wired, so prefer `slot="name"`.)

### Behavior Files (`.behavior.adx.js`)

Deterministic setup, synchronous handlers that may mutate state, no classes:

```js
// Required: Initialize component state
export function setup(props) {
  return {
    count: 0,
    name: props.name
  }
}

// Event handlers (must start with 'on')
export function onClick(state, event) {
  state.count++ // mutate state directly
  emit('incremented', { count: state.count })
}

export function onInput(state, event) {
  state.name = event.target.value
}

// Computed values (must start with 'get')
// A single bare reference to one — `{{displayName}}` or `:title="displayName"` —
// is live: after a handler runs, ADX re-calls getDisplayName over the updated
// state and patches that node. Computed member chains (`{{displayName.foo}}`)
// and mixed templates stay at their build-time value.
export function getDisplayName(state) {
  return state.name.toUpperCase()
}

// Planned lifecycle hooks: names are recognized but never invoked today
export function onMounted(state) {
  console.log('Component mounted')
}

export function onUnmounted(state) {
  console.log('Component unmounted')
}
```

**Planned Lifecycle Hooks (Not Invoked Today)**:
- `onMounted()` - After component is added to DOM
- `onUnmounted()` - Before component is removed
- `onUpdated()` - After state changes

**Emitting Events**:
```js
emit('eventName', payload)
```

### Style Files (`.style.adx.css`)

**Using Design Tokens**
```css
@use tokens;

.element {
  /* Tokens are automatically prefixed */
  pad: tokens.space-4;
  bg: tokens.primary;
  color: tokens.text-1;
}
```

**Abbreviated Properties**

Full list of abbreviations:
```css
pad → padding
bg → background
radius → border-radius
size → font-size
weight → font-weight
```

**Responsive Design**
```css
.element {
  pad: tokens.space-4;
  
  @media (min-width: tokens.breakpoint-md) {
    pad: tokens.space-6;
  }
  
  @media (min-width: tokens.breakpoint-lg) {
    pad: tokens.space-8;
  }
}
```

**Automatic Scoping**

All styles are automatically scoped to the component. No need for BEM or CSS modules:

```css
/* This only affects elements in this component */
.card {
  bg: white;
}

/* Even generic names are safe */
.button {
  bg: blue;
}
```

## Planned Patterns (Not Implemented)

The following examples describe a future pattern library, not working compiler
features. `@adx/patterns` is unavailable; use ordinary HTML and existing project
components today. Accessibility remains the component author's responsibility.

### Layout

**Stack** (vertical spacing)
```adx
<stack :gap="space-4">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</stack>
```

**Grid** (responsive columns)
```adx
<grid :cols="3" :gap="space-4">
  <card>Card 1</card>
  <card>Card 2</card>
  <card>Card 3</card>
</grid>
```

**Sidebar**
```adx
<sidebar :width="280px">
  <template #sidebar>
    <nav>Navigation</nav>
  </template>
  <template #main>
    <main>Content</main>
  </template>
</sidebar>
```

### Forms

```adx
<form @submit="onSubmit">
  <field :label="Username" :required="true" :error="errors.username">
    <input :value="username" @input="onUsernameInput">
  </field>
  
  <field :label="Email" :type="email" :error="errors.email">
    <input type="email" :value="email" @input="onEmailInput">
  </field>
  
  <button type="submit">Sign Up</button>
</form>
```

### Data Display

**Table**
```adx
<table 
  :data="users" 
  :columns="columns"
  :sortable="true"
  @sort="onSort">
</table>
```

```js
// In behavior
export function setup(props) {
  return {
    users: [
      { id: 1, name: 'John', email: 'john@example.com' },
      { id: 2, name: 'Jane', email: 'jane@example.com' }
    ],
    columns: [
      { key: 'name', label: 'Name', sortable: true },
      { key: 'email', label: 'Email', sortable: true }
    ]
  }
}
```

### Feedback

**Toast Notifications**
```js
import { toast } from '@adx/patterns'

toast.success('Profile updated!')
toast.error('Failed to save')
toast.info('New message', { duration: 5000 })
```

**Modal**
```adx
<modal :open="showModal" @close="onCloseModal">
  <h2>Confirm Action</h2>
  <p>Are you sure you want to proceed?</p>
  <button @click="onConfirm">Yes</button>
  <button @click="onCloseModal">Cancel</button>
</modal>
```

## Design System (Tokens)

ADX includes a complete design system out of the box:

### Spacing Scale (4px base)
- `space-0` → 0
- `space-1` → 4px
- `space-2` → 8px
- `space-3` → 12px
- `space-4` → 16px
- `space-6` → 24px
- `space-8` → 32px
- `space-12` → 48px
- `space-16` → 64px

### Colors

**Surfaces** (backgrounds)
- `surface-0` → Lightest
- `surface-1` → Light
- `surface-2` → Medium
- `surface-3` → Dark

**Text**
- `text-1` → Primary
- `text-2` → Secondary
- `text-3` → Tertiary

**Semantic**
- `primary` → Brand color
- `secondary` → Secondary brand color
- `success` → Green
- `warning` → Yellow
- `error` → Red
- `info` → Blue

### Typography

**Sizes**
- `text-xs` → 12px
- `text-sm` → 14px
- `text-base` → 16px
- `text-lg` → 18px
- `text-xl` → 20px
- `text-2xl` → 24px
- `text-3xl` → 30px

**Weights**
- `weight-normal` → 400
- `weight-medium` → 500
- `weight-bold` → 700

### Customizing Tokens

Edit `tokens/design-tokens.json`:

```json
{
  "colors": {
    "primary": "#3b82f6",
    "secondary": "#8b5cf6"
  },
  "spacing": {
    "base": 4
  },
  "typography": {
    "fontFamily": {
      "sans": "Inter, system-ui, sans-serif"
    }
  }
}
```

## Working with AI

ADX is optimized for AI pair programming:

### Best Practices

**1. Let AI read manifests**
```
You: "What props does UserCard accept?"
AI: [reads manifest.json in ~50 tokens instead of parsing 800+ tokens of source]
```

**2. Be specific about concerns**
```
You: "Change the card's background color"
AI: [only reads/modifies style.adx.css]

You: "Add a 'status' prop"
AI: [modifies manifest.json + structure.adx + behavior.adx.js]
```

**3. Use patterns**
```
You: "Create a data table with sorting and pagination"
AI: [uses built-in pattern, ~300 tokens instead of building from scratch with ~3,500 tokens]
```

**4. Reference token efficiency**
```
You: "Make this component with ADX best practices"
AI: [follows token-efficient patterns automatically]
```

## CLI Commands

Milestones 1 and 2 (plus the shipped scaffolders) provide the init/create/pattern/build/check/serve/tokens/help commands below; the rest are planned.

```bash
# Working today (M1 + M2)
adx init [name] [--tailwind]                                          # scaffold an app-shell starter (./<name>, or the current dir); --tailwind pins Tailwind
adx create <path>/<component-name>                                    # scaffold one new component (last segment = name; leading segments = nested folders)
adx pattern [<name>] [targetDir] [--list]                             # scaffold an accessible built-in pattern (form, table, modal)
adx build <dir>  [--out dist] [--tokens <path>] [--data <file.json>]  # compile one component to static HTML + CSS + glue
adx build <page.json> [--out dist] [--tokens <path>] [--site <site.json>]  # compile a page (composes components); --site merges shared assets
adx serve [dir] [--port 3000] [--host localhost]                      # preview a build locally (static server, does not compile)
adx check <dir>  [--tokens <path>] [--data <file.json>]               # validate a component (prints OK, or an [ADX] error)
adx check <page.json> [--tokens <path>] [--site <site.json>]          # validate every component instance on a page
adx tokens [--tokens <path>]                                          # list every design token (name = value), grouped by category
adx help                                                              # show the full command listing and exit
npm run benchmark                                                     # measured ADX-vs-React token comparison (dev-only)

# Planned
adx dev                # Start dev server (hot reload); richer project/pattern templates
```

### Scaffold a built-in pattern

`adx pattern <name>` drops an accessible-by-default component into your project.
Run `adx pattern` (or `adx pattern --list`) to see the catalog: `form`, `table`,
and `modal`. Each scaffolds four `.adx` files that build and check with no
`--data`, use design tokens only, and carry the accessibility baseline (form
labels + a live error region, a dialog role + accessible name, scoped table
headers + caption). The four files land flat in `targetDir`, which defaults to
the pattern name — so `adx pattern form` creates `./form/` and `adx pattern form
ui/contact-form` creates `./ui/contact-form/`, just like `adx create`. Like
`adx init`/`adx create`, it refuses to overwrite and
writes nothing on conflict. One honest caveat: the `modal` pattern ships correct
static dialog semantics plus an `onClose` that emits `close`, but `:if`-driven
open/close toggling is not a runtime behavior in this release — a host decides
when the dialog is mounted.

### Add a component to an existing project

`adx create <path>/<component-name>` drops one new four-file component into the
current project (it does not scaffold a whole project — use `adx init` for
that). The name is a lowercase, hyphenated slug (e.g. `widget-card`), which also
becomes the component directory and a PascalCase manifest name (`WidgetCard`):

```bash
adx create widget-card   # writes widget-card/{manifest.json,structure.adx,behavior.adx.js,style.adx.css}
adx check widget-card    # compiles clean with no --data (every prop has a default)
```

You can also group components under folders by giving a path. Everything to the
LEFT of the last `/` is created as nested folders (mkdir -p style); the LAST
segment is the component name:

```bash
adx create landing/footer    # writes landing/footer/{manifest.json,…}; manifest name Footer
adx create landing/header    # writes landing/header/…; manifest name Header
adx create contact-us/main   # arbitrary depth works: a/b/c/footer is valid too
adx create button            # a bare name still scaffolds flat in the current dir
```

The PascalCase manifest `name` comes from the LAST segment only, so the same
component name is reusable across folders (`landing/footer` and `blog/footer`
both get name `Footer`). Each `/`-separated segment must be a valid slug;
intermediate folders are created on demand, but only the four component files
are overwrite-guarded — so creating into an existing folder that lacks them
succeeds.

Every prop defaults, so the component builds and checks immediately, and the
template already meets the token + WCAG-AA quality bar (semantic `<article>`, an
`<h2>` title so it composes under a page's `<h1>`, and a token-sized touch
target on the button). Like `adx init`, it refuses to overwrite: if any of the
four files already exists it writes nothing and exits 1 with the `[ADX] … already
exists; refusing to overwrite` error. An invalid or empty segment, a `..`
segment, a backslash, or an absolute path is rejected with an `[ADX] <input> - …`
error, exit 1, writing nothing.

### Start a new project

The quickest way in is `adx init`. It creates a root layout component
`app-shell/` (semantic header/main/footer) that composes a `hello-card/` in its
content region, a page (`index.json`) placing `app-shell` at the site root,
tokens, README, `AGENTS.md`, `.gitignore`, and a private `package.json` with npm
scripts and a local ADX development dependency pinned to the generating CLI's
version. Add `--tailwind` to also pin Tailwind (exact) and wire the build-time
static-CSS path (`styles/tailwind.css`, a `tailwind` npm script, and an
`assets.css` reference) ready to install — it still only writes files:

```bash
npx --yes --package project-adx-0 adx init my-app
cd my-app
npm install
npm run check
npm run build           # compile the page -> dist/index.html
npm run serve           # open the printed http://localhost:3000/ URL
```

`adx init` refuses to overwrite an existing project (it writes nothing if any
starter file is already there), so it is safe to run in a fresh directory. Omit
the name (or pass `.`) to scaffold into the current directory.

`init` only writes files; dependency installation is the explicit next step.
Commit source, `package.json`, and the `package-lock.json` generated by
`npm install`. The starter ignores `node_modules/` and `dist/`. Anyone cloning
the project can run `npm install` and these scripts without a global CLI.
CI can use `npm ci` with the committed lockfile; include dev dependencies when
building. For standalone components or other commands after installing, use
`npx adx build hello-card`, `npx adx tokens`, etc.

Commit `AGENTS.md` too. It gives supporting agents Caveman chat defaults (without
requiring the skill), protects compiler/installed/generated files from app edits,
and instructs local CLI installation when missing. Code and documentation remain
normal prose. For clients that do not auto-load it, ask the agent to read it.

### Giving your component real data

A component with a required prop (like `user-card`'s `name`) needs a value to put
in the HTML. Pass one with `--data`, pointing at a JSON file of props:

```bash
echo '{ "name": "Ada Lovelace", "role": "Founder" }' > data.json
node dist/cli.js build fixtures/user-card --data data.json --out dist
```

Once it's built, `adx serve dist/user-card` spins up a small static server and
prints a `http://localhost:3000/` URL so you can open the result in a browser.
It only serves what's already compiled — it doesn't rebuild — so re-run `build`
after you change a component.

Behind the scenes both `build` and `check` run your component's `setup()` at build
time in a Node VM context with a timeout. This is trusted code execution, not
security isolation: constructor access can reach the host environment. Only
compile trusted components, or use an externally restricted build environment.
Without data, a required
prop that has no default now fails the build with a clear
`[ADX] manifest.json - Missing required prop "name" (...)` — no more silent empty
headings.

What `adx build` produces for each component: a complete `index.html` (all
`{{...}}` already filled in, so search engines and AI crawlers see the real
content without running any JavaScript), a scoped `style.css` with your design
tokens resolved to real values, a tiny `glue.js` that only *attaches*
interactivity to the HTML that's already there (it never rebuilds the page), and
a `behavior.js` — your `behavior.adx.js` copied as-is — that the glue imports for
its `setup`/`on<Event>` handlers. The compiler parses those exports with Acorn to wire
handlers, and it *runs* `setup()` (and any `get*()` it needs) at build time inside
the VM context described above to compute the state it bakes into the HTML.
Composed children receive their own behavior/glue files in standalone builds too.
Declared props and defaults are type-checked; null is not a valid declared prop
value, and omitted optional props may use defaults.

### Compiling a component today

The global `adx` command arrives with the npm release; today you run the compiler
straight from the repo root. Build it once, then point the CLI at a component
directory (one component at a time) or a page manifest (which composes several).
The bundled `user-card` fixture is the easiest thing to try — it has a required
`name`, so give it data:

```bash
npm install        # first time only
npm run build      # tsc -> dist/

echo '{ "name": "Ada Lovelace" }' > /tmp/user-card.json

# Compile the fixture to dist/user-card/{index.html,style.css,glue.js,behavior.js}
node dist/cli.js build fixtures/user-card --data /tmp/user-card.json --out dist

# Validate without writing files (prints OK, or an [ADX] error)
node dist/cli.js check fixtures/user-card --data /tmp/user-card.json
```

> Running `check` (or `build`) on `user-card` **without** `--data` now fails on
> purpose: `name` is required and has no default, so there is nothing to put in
> `<h2>`. That is the point of build-time data — it turns a silent empty heading
> into a clear error.

Open `dist/user-card/index.html` and you'll see the real content already in the
markup — `<h2>Ada Lovelace</h2>`, no `{{name}}` placeholder left for the browser
to fill in. That's the SEO contract working: a crawler that never runs JavaScript
still sees the whole component.

### Sitemap and robots.txt

To help crawlers discover your pages, add a `baseUrl` to `site.json` — your
site's absolute origin, e.g. `https://example.com` — and pass `--site site.json`
to `adx build`. Each page build then writes a `sitemap.xml` and an allow-all
`robots.txt` into the top of your output folder:

```json
{ "baseUrl": "https://example.com" }
```

```bash
adx build index.json --out dist --site site.json
# dist/sitemap.xml  +  dist/robots.txt
```

The sitemap lists each page's clean URL (your root page as `https://example.com/`,
a page with slug `about` as `https://example.com/about/`), and `robots.txt`
points crawlers at it. The URL comes from the page's slug, so it always matches
where the page is written. A trailing slash on `baseUrl` is fine — it is
normalized. Leave `baseUrl` out (or drop `--site`) and neither file is written
and your page output is unchanged. `adx check` never writes these files.

### A small 2-page site from composed components

M2 can build a whole site, not just one component. The shape: a shared
`site-header`, a `user-card`, and two page manifests (`index` and `about`) that
compose them with per-page data. The bundled `fixtures/site/` is exactly this.

A page manifest is a flat JSON file listing the components it uses and their data:

```json
// fixtures/site/index.json
{
  "page": "index",
  "title": "ADX Demo — Home",
  "description": "The home page of the ADX two-page demo site.",
  "lang": "en",
  "schema": "WebPage",
  "components": [
    { "use": "./site-header", "data": { "siteName": "ADX Demo", "current": "home" } },
    { "use": "../user-card",  "data": { "name": "Ada Lovelace", "role": "Founder", "bio": "First programmer." } }
  ]
}
```

```json
// fixtures/site/about.json
{
  "page": "about",
  "title": "About us",
  "description": "Who we are and what ADX is.",
  "lang": "en",
  "canonical": "/about/",
  "schema": "AboutPage",
  "components": [
    { "use": "./site-header", "data": { "siteName": "ADX Demo", "current": "about" } },
    { "use": "../user-card",  "data": { "name": "Grace Hopper", "role": "Advisor", "bio": "Compiler pioneer." } }
  ]
}
```

The `site-header` component declares a default slot, and a page (or a parent
component) can project content into it with `<template slot="…">`; `user-card`
declares a named `actions` slot the same way. Each `data` block fills that
instance's props — the same shape as a `--data` file.

Build both pages:

```bash
node dist/cli.js build fixtures/site/index.json --out dist
node dist/cli.js build fixtures/site/about.json --out dist
```

You get `dist/index.html` and `dist/about/index.html` (clean URLs: `/` and
`/about/`), each a complete document with its own `<title>`, meta description, and
canonical URL, the real content already in the markup, and — for `about` — a
JSON-LD block typed `AboutPage`. Each page's `style.css`/`glue.js` sit beside it.
If the same component appears more than once on a page, each copy hydrates
independently (its own state, its own events).

Validate a page the same way:

```bash
node dist/cli.js check fixtures/site/about.json
```

`check` on a page validates every instance's required props, so it fails with the
child's `[ADX] manifest.json - Missing required prop ...` if any instance is
missing data.

### Using Tailwind (or any CSS library) with ADX

Use **build-time static CSS**. ADX links the generated stylesheet through page
`assets` or a shared site config; it never runs Tailwind, copies assets, or checks
whether an asset URL exists. Tailwind is an app development dependency, not an
ADX runtime dependency.

#### Tailwind v4: runnable starter

The fastest route is `adx init my-app --tailwind`, which pins Tailwind, writes
`styles/tailwind.css`, adds a `tailwind` npm script that `npm run build` runs
before `adx build`, and references `/tailwind.css` from `index.json` via
`assets.css` (no `site.json` needed). Then `npm install` and `npm run build`.

To wire it by hand instead, create an app (skip `init` for an existing app):

```bash
npx --yes --package project-adx-0 adx init my-app
cd my-app
npm install -D tailwindcss@4 @tailwindcss/cli@4
mkdir -p styles
```

Create `styles/tailwind.css` with the following. `source("../")` scans the app
root relative to this stylesheet, including `.adx`, JavaScript and JSON files:

```css
@import "tailwindcss" source("../");
```

Replace `hello-card/structure.adx` with this utility-only example, and empty
`hello-card/style.adx.css` so no component declarations compete. Keep the
starter manifest, behavior and page files unchanged. The card title stays an
`<h2>` (the `app-shell/` header owns the page's single `<h1>`):

```adx
<section class="p-2.5 md:grid gap-4">
  <h2 class="text-2xl font-bold">Hello, Tailwind</h2>
  <a href="#details" class="hover:underline">Read more</a>
  <p id="details" class="w-1/2">Static HTML, static CSS.</p>
</section>
```

Create `site.json` at the app root:

```json
{ "assets": { "css": ["/tailwind.css"] } }
```

Then generate CSS, validate/build the page and preview:

```bash
npx @tailwindcss/cli -i styles/tailwind.css -o dist/tailwind.css --minify
npm run check -- --site site.json
npm run build -- --site site.json
npm run serve
```

Open the printed URL. Rebuild Tailwind CSS and the ADX page after edits; `serve`
does neither. For an existing page, add `assets.css` directly or pass `--site`
to both build and check. There is no site-config auto-discovery.

#### Class detection and syntax

- Use literal `class="..."` for Tailwind. ADX dot shorthand only accepts
  `[a-zA-Z][a-zA-Z0-9_-]*`; `.md:grid`, `.w-1/2`, `.p-2.5`, `.w-[37px]`,
  `.-mt-2` and `.p-4!` are invalid.
- Keep each class name complete in source. For dynamic choices, map values to
  full strings such as `"bg-red-600"` / `"bg-green-600"`; do not concatenate
  `"bg-" + color + "-600"`. ADX runtime behavior is unchanged.
- Tailwind ignores gitignored files and `node_modules` by default. Register
  additional sources with `@source "../node_modules/my-components";`, relative
  to the input stylesheet. For classes absent from source (e.g. external data),
  use `@source inline("bg-red-600 bg-green-600");`.
- Keep Tailwind imports/directives in the separate input CSS, **not**
  `style.adx.css`: ADX's CSS transformer is not a Tailwind processor.

#### Cascade and existing component styles

The external stylesheet follows ADX's scoped stylesheet, but **loading last does
not guarantee precedence**. ADX emits unlayered rules such as
`.card[data-adx-c="..."]`; normal unlayered declarations outrank Tailwind v4's
layered utilities. Even unlayered utilities can lose to ADX's higher specificity.

Prefer one styling owner per property: remove competing ADX declarations when
switching a component to utilities. If an override is intentional, v4 supports
`class="p-2.5!"` for a single utility. To make all utilities important, explicitly
replace the input import with:

```css
@import "tailwindcss" source("../") important;
```

This overrides normal ADX declarations, not every possible `!important`/inline
style conflict. It is an author opt-in, not an ADX default. Tailwind's global
Preflight reset can also affect existing components; check typography, borders
and controls when integrating. See [Preflight](https://tailwindcss.com/docs/preflight)
for opting out of the reset.

#### Asset URLs and shared configuration

Asset strings are **browser URLs relative to the emitted document**, not paths
relative to the manifest. Root pages write to `dist/index.html`; other pages to
`dist/<slug>/index.html`. For `/tailwind.css`, generate `dist/tailwind.css`.
For `./page-extra.css` on a `styled` page, supply `dist/styled/page-extra.css`
yourself. On subpath hosting, prefix shared URLs (e.g. `/my-app/tailwind.css`);
ADX does not infer the deployment base.

Site assets precede page assets, with CSS deduped by exact URL and JS by `src`
(first entry's flags win). Raw `head` strings are not deduped and must be trusted.
An explicit page `lang` wins over the site's default, then `en`.
Full [asset schema and errors](./adx-grammar.md#12-pagesite-assets-schema-json-not-adx).

Author scripts follow glue in markup, not necessarily execution. Classic scripts
can run before the deferred glue; `async` scripts are unordered. Wait for
`DOMContentLoaded` if your code requires hydration.

**Do not use the Play CDN runtime in components.** It generates CSS in the
browser, making styling depend on JavaScript. Static CSS preserves the
JS-independent output contract; other external scripts remain author-owned.

#### Existing Tailwind v3 projects

Keep the v3 workflow only when deliberately pinned to v3:

```bash
npm install -D tailwindcss@3
npx tailwindcss -i src/input.css -o dist/tailwind.css --minify
```

Retain the v3 `@tailwind base/components/utilities` directives and configure
`content` to include `.adx`, behavior JS and class-bearing JSON. V4 uses the
separate CLI package and CSS import shown above; see the
[official upgrade guide](https://tailwindcss.com/docs/upgrade-guide).

## Configuration

`adx.config.json`:

```json
{
  "version": "1.0.0",
  "compiler": {
    "target": "es2020",
    "minify": true
  },
  "tokens": "./tokens/design-tokens.json",
  "patterns": {
    "import": "@adx/patterns"
  },
  "build": {
    "outDir": "./dist",
    "sourcemap": true
  },
  "dev": {
    "port": 3000,
    "hot": true
  }
}
```

## Migration from React/Vue

Coming from React or Vue? Here's a translation guide:

### React → ADX

| React | ADX |
|-------|-----|
| `useState()` | State in `setup()` return |
| `useEffect()` | `onMounted()` / `onUpdated()` |
| `props.name` | `props.name` (same) |
| `className={styles.card}` | `.card` |
| `onClick={handler}` | `@click="handler"` |
| `{condition && <div>}` | `<div :if="condition">` |
| `{items.map(i => ...)}` | `<div :for="i in items">` |

### Vue → ADX

| Vue | ADX |
|-----|-----|
| `<div :class="card">` | `<div .card>` |
| `<div v-if="show">` | `<div :if="show">` |
| `<div v-for="i in items">` | `<div :for="i in items">` |
| `<div @click="handler">` | `<div @click="handler">` (same) |
| `ref()` / `reactive()` | State in `setup()` |
| `computed()` | `getPropertyName()` functions |

## Next Steps

- Read `agent-reference.md` to understand AI optimization
- Check `token-efficiency.md` for performance details
- Explore `architecture.md` for design decisions
- Build something! AI will help you learn fast.

---

*Designed for AI. Built for humans.*
