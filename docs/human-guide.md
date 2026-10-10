# ADX Human Guide

Welcome! ADX might look different from frameworks you've used before. That's intentional - it's designed primarily for AI agents but built to remain human-readable.

## Why ADX Looks Different

Traditional frameworks (React, Vue, Svelte) were designed for human developers. ADX inverts that priority:

**Primary User**: AI coding agents  
**Secondary User**: Human developers

This means:
- Syntax is more compact (fewer tokens for AI)
- Files are separated (easier for AI to target)
- Patterns are built-in (less for AI to generate)
- Documentation is exhaustive (optimized for AI context windows)

The result? Your AI pair programmer reads and edits ADX with fewer tokens. On the
measured single-component tasks the saving is about 13-14% versus an equivalent
React component (run `npm run benchmark` to reproduce); the larger figures you may
have seen were hand estimates. See `docs/token-efficiency.md` for the measured
numbers and where bigger savings are expected to come from.

## Quick Start

### Installation

```bash
npm install -g adx
adx create my-app   # planned (M1 ships build/check only — see CLI Commands below)
cd my-app
adx dev             # planned
```

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

Pure functions, no classes:

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
export function getDisplayName(state) {
  return state.name.toUpperCase()
}

// Lifecycle hooks
export function onMounted(state) {
  console.log('Component mounted')
}

export function onUnmounted(state) {
  console.log('Component unmounted')
}
```

**Available Lifecycle Hooks**:
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

## Built-In Patterns

ADX includes professionally designed patterns. Use them as-is or extend them.

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

Milestones 1 and 2 ship the build/check commands below; the rest are planned.

```bash
# Working today (M1 + M2)
adx build <dir>  [--out dist] [--tokens <path>] [--data <file.json>]  # compile one component to static HTML + CSS + glue
adx build <page.json> [--out dist] [--tokens <path>]                  # compile a page (composes components) to one index.html
adx check <dir>  [--tokens <path>] [--data <file.json>]               # validate a component (prints OK, or an [ADX] error)
adx check <page.json> [--tokens <path>]                               # validate every component instance on a page
npm run benchmark                                                     # measured ADX-vs-React token comparison (dev-only)

# Planned
adx create <name>      # Create new project
adx dev                # Start dev server (hot reload)
adx tokens             # List all available tokens
adx pattern <name>     # Generate pattern component
adx help               # Show help
```

### Giving your component real data

A component with a required prop (like `user-card`'s `name`) needs a value to put
in the HTML. Pass one with `--data`, pointing at a JSON file of props:

```bash
echo '{ "name": "Ada Lovelace", "role": "Founder" }' > data.json
node dist/cli.js build fixtures/user-card --data data.json --out dist
```

Behind the scenes the compiler runs your component's `setup()` once, at build
time, in a locked-down sandbox (no file system, no network, no `process`, with a
timeout), so the real state lands in the static HTML. Without data, a required
prop that has no default now fails the build with a clear
`[ADX] manifest.json - Missing required prop "name" (...)` — no more silent empty
headings.

What `adx build` produces for each component: a complete `index.html` (all
`{{...}}` already filled in, so search engines and AI crawlers see the real
content without running any JavaScript), a scoped `style.css` with your design
tokens resolved to real values, a tiny `glue.js` that only *attaches*
interactivity to the HTML that's already there (it never rebuilds the page), and
a `behavior.js` — your `behavior.adx.js` copied as-is — that the glue imports for
its `setup`/`on<Event>` handlers. The compiler name-scans those exports to wire
handlers, and it *runs* `setup()` (and any `get*()` it needs) at build time inside
the sandbox described above to compute the state it bakes into the HTML.

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
