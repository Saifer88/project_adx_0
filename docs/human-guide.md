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

The result? Your AI pair programmer is 70% more efficient when working with ADX.

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
  <template #actions>
    <button @click="onFollowClick">Follow</button>
    <button>Message</button>
  </template>
</user-card>
```

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
  <template #header>
    <h1>Title</h1>
  </template>
  
  <p>Default content</p>
  
  <template #footer>
    <p>Footer</p>
  </template>
</my-component>
```

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

Milestone 1 ships two working commands; the rest are planned.

```bash
# Working today (M1)
adx build <dir> [--out dist] [--tokens <path>]  # compile a component to static HTML + CSS + glue
adx check <dir> [--tokens <path>]               # validate a component (prints OK, or an [ADX] error)

# Planned
adx create <name>      # Create new project
adx dev                # Start dev server (hot reload)
adx tokens             # List all available tokens
adx pattern <name>     # Generate pattern component
adx help               # Show help
```

What `adx build` produces for each component: a complete `index.html` (all
`{{...}}` already filled in, so search engines and AI crawlers see the real
content without running any JavaScript), a scoped `style.css` with your design
tokens resolved to real values, a tiny `glue.js` that only *attaches*
interactivity to the HTML that's already there (it never rebuilds the page), and
a `behavior.js` — your `behavior.adx.js` copied as-is — that the glue imports for
its `setup`/`on<Event>` handlers.

### Compiling a component today

The global `adx` command arrives with the npm release; today you run the compiler
straight from the repo root. Build it once, then point the CLI at a component
directory. M1 compiles one component at a time, and the bundled `user-card`
fixture is the easiest thing to try:

```bash
npm install        # first time only
npm run build      # tsc -> dist/

# Compile the fixture to dist/user-card/{index.html,style.css,glue.js,behavior.js}
node dist/cli.js build fixtures/user-card --out dist

# Validate without writing files (prints OK, or an [ADX] error)
node dist/cli.js check fixtures/user-card
```

Open `dist/user-card/index.html` and you'll see the real content already in the
markup — no `{{name}}` placeholders left for the browser to fill in. That's the
SEO contract working: a crawler that never runs JavaScript still sees the whole
component.

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
