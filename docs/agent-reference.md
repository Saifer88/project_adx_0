# ADX Agent Reference

**Optimized for LLM Context Windows**

This document is the single source of truth for AI agents working with ADX. It is structured for maximum token efficiency and fast scanning.

## Quick Reference Card

```
COMPONENT CREATION
  1. mkdir component-name
  2. Create 4 files: structure.adx, behavior.adx.js, style.adx.css, manifest.json
  3. Define props in manifest.json first
  4. Build structure.adx (refer to props)
  5. Add behavior.adx.js (pure functions)
  6. Style with tokens in style.adx.css

COMPONENT MODIFICATION
  1. Read manifest.json (understand contract)
  2. Identify concern: structure/behavior/style
  3. Edit only relevant .adx file
  4. Update manifest.json if API changed

PATTERN USAGE
  import { PatternName } from '@adx/patterns'
  Use as base, extend as needed
  Patterns: grid, stack, form, table, modal, toast, nav, tabs
```

## File Templates

### manifest.json
```json
{
  "name": "ComponentName",
  "version": "1.0.0",
  "props": {
    "propName": {
      "type": "string|number|boolean|array|object",
      "required": true|false,
      "default": "value"
    }
  },
  "emits": ["eventName"],
  "slots": ["slotName"],
  "deps": ["./relative/path"]
}
```

### structure.adx
```adx
<element .className>
  <element :prop="value">{{interpolated}}</element>
  <slot slotName />
</element>
```

**Syntax**:
- `.className` = class binding (shorthand)
- `:prop` = property binding (shorthand)
- `{{var}}` = text interpolation
- `<slot name />` = content slot

### behavior.adx.js
```js
export function setup(props) {
  // Initialize state
  return { key: value }
}

export function onEventName(state, event) {
  // Handle event
  emit('customEvent', data)
}
```

**Rules**:
- All exports are pure functions
- `setup()` required, returns initial state
- Event handlers: `on{EventName}(state, event)`
- Use `emit(name, data)` for custom events

### style.adx.css
```css
@use tokens;

.className {
  /* Layout */
  display: flex|grid|block;
  pad: tokens.space-N;
  gap: tokens.space-N;
  
  /* Visual */
  bg: tokens.color-name;
  color: tokens.color-name;
  radius: tokens.radius-sm|md|lg|full;
  shadow: tokens.shadow-sm|md|lg;
  
  /* Typography */
  font: tokens.font-family-name;
  size: tokens.text-sm|base|lg|xl;
  weight: tokens.weight-normal|medium|bold;
  
  /* Responsive */
  @media (min-width: tokens.breakpoint-md) {
    /* overrides */
  }
}
```

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

## Built-In Patterns

### Layout Patterns

**Stack** (vertical spacing):
```adx
<div .stack :gap="space-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

**Grid** (responsive columns):
```adx
<div .grid :cols="3" :gap="space-4">
  <div>Card 1</div>
  <div>Card 2</div>
  <div>Card 3</div>
</div>
```

**Sidebar** (main + sidebar layout):
```adx
<div .sidebar :sideWidth="300px">
  <aside>Sidebar</aside>
  <main>Content</main>
</div>
```

**Cluster** (wrapped horizontal):
```adx
<div .cluster :gap="space-2">
  <span>Tag 1</span>
  <span>Tag 2</span>
  <span>Tag 3</span>
</div>
```

### Form Patterns

**Form**:
```adx
<form .form @submit="onSubmit">
  <field :label="Name" :error="errors.name">
    <input :value="name" @input="onNameChange">
  </field>
  <button type="submit">Submit</button>
</form>
```

**Field** (label + input + error):
```adx
<field :label="Email" :required="true" :error="emailError">
  <input type="email" :value="email">
</field>
```

### Data Patterns

**Table**:
```adx
<table .table :data="rows" :columns="cols">
  <template #cell="{ col, row }">
    {{row[col.key]}}
  </template>
</table>
```

**List**:
```adx
<list :items="users" :keyField="id">
  <template #item="{ item }">
    <div>{{item.name}}</div>
  </template>
</list>
```

### Feedback Patterns

**Toast** (notification):
```js
// In behavior.adx.js
import { toast } from '@adx/patterns'

toast.success('Saved!', { duration: 3000 })
toast.error('Failed', { duration: 5000 })
toast.info('Info message')
```

**Modal**:
```adx
<modal :open="isOpen" @close="onClose">
  <h2>Title</h2>
  <p>Content</p>
  <button @click="onClose">Close</button>
</modal>
```

**Alert**:
```adx
<alert :type="success|warning|error|info">
  Message text
</alert>
```

**Loader**:
```adx
<loader :active="isLoading" :message="Loading...">
  <!-- Content shown when not loading -->
</loader>
```

### Navigation Patterns

**Nav**:
```adx
<nav .nav :items="navItems" :active="currentPath">
  <template #item="{ item }">
    <a :href="item.path">{{item.label}}</a>
  </template>
</nav>
```

**Tabs**:
```adx
<tabs :items="tabs" :active="activeTab" @change="onTabChange">
  <template #panel="{ item }">
    <div>{{item.content}}</div>
  </template>
</tabs>
```

**Breadcrumb**:
```adx
<breadcrumb :items="path">
  <template #item="{ item, isLast }">
    <a v-if="!isLast" :href="item.path">{{item.label}}</a>
    <span v-else>{{item.label}}</span>
  </template>
</breadcrumb>
```

**Pagination**:
```adx
<pagination :total="100" :perPage="10" :current="page" @change="onPageChange" />
```

## Common Modifications

### Add New Prop
1. Edit `manifest.json`, add to `props` object
2. Use prop in `structure.adx`: `:attrName="propName"` or `{{propName}}`
3. Handle in `behavior.adx.js` `setup()` if needed

### Add Event Handler
1. In `structure.adx`: `@eventName="handlerName"`
2. In `behavior.adx.js`: `export function onHandlerName(state, event) { ... }`
3. In `manifest.json`: add `"handlerName"` to `emits` array if custom event

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
1. Edit `style.adx.css` only
2. Use tokens: `tokens.space-N`, `tokens.color-name`
3. Use abbreviated properties: `pad`, `bg`, `radius`

## Token Optimization Tips

1. **Read manifest.json first** before parsing component source (saves 200+ tokens)
2. **Edit single file** per concern (don't read all 4 files unless needed)
3. **Use patterns** instead of building from scratch (saves 400+ tokens)
4. **Reference this doc** for syntax (don't guess abbreviations)
5. **Emit minimal explanations** to user (code + 1 sentence)

## UX/UI Baseline (always apply)

Every component meets this baseline by default. Patterns carry it for free; raw components must honor it.

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

**Beyond the baseline** (design systems, palettes, fonts, charts, stack rules): invoke the `ui-ux-pro-max` skill — one dominant intent, 2-5 terms. Its output must still satisfy this baseline.

## Error Messages

ADX provides concise, actionable errors:

```
[ADX] structure.adx:5 - Unknown prop "titel" (did you mean "title"?)
[ADX] manifest.json - Missing required field "name"
[ADX] style.adx.css:12 - Unknown token "tokens.space-5" (available: 0,1,2,3,4,6,8,12,16)
```

## Compilation

Grammar/AST contract: see [docs/adx-grammar.md](./adx-grammar.md) (parser's source of truth).

M1 compiler (`compiler/`) implements two commands; the rest are planned.

```bash
# IMPLEMENTED (M1)
adx build <dir> [--out dist] [--tokens <path>]  # emit dist/<name>/index.html|style.css|glue.js
adx check <dir> [--tokens <path>]               # validate+emit in-memory; prints OK or [ADX] error

# PLANNED
adx dev                # Dev server with hot reload
adx tokens             # List all available tokens
adx create / pattern   # Scaffolding
```

Build output per component (M1):

- `index.html` — complete static HTML; every `{{...}}`/`:prop` resolved at build
  time, `:if`/`:else`/`:for` applied, `<slot>` -> `data-adx-slot` placeholder.
  Owned elements carry `data-adx-c="<scopeId>"`; bound/event nodes also carry a
  stable `data-adx-b="<scopeId>-<n>"` hook. Zero `{{` remain (SEO contract).
- `style.css` — `@use tokens;` stripped, abbreviated props expanded
  (`pad`→padding, `bg`→background, `radius`→border-radius, `size`→font-size,
  `weight`→font-weight, `shadow`→box-shadow, …), every `tokens.*` resolved, each
  selector scoped as `<sel>[data-adx-c="<id>"]`, `@media` passed through with
  `tokens.breakpoint-*` resolved to px.
- `glue.js` — hydration-only ES module: imports behavior exports, calls
  `setup(props)` once, selects existing DOM by `data-adx-c`/`data-adx-b`, wires
  each `@event` to its handler `(state, event)`. No vDOM, no `createElement`.

`scopeId` is deterministic: `c` + first 7 hex of `sha256(name \0 dirBasename)`.

---

*This reference is optimized for agent context windows. Token count: ~2,400*
