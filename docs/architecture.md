# ADX Architecture

## Design Pillars

### 1. Token Efficiency (Primary)

Every architectural decision must answer: "Does this reduce token consumption for AI agents?"

**Measurement**: We measure efficiency by:
- Tokens required to understand component
- Tokens required to modify component
- Tokens required to create new component
- Tokens in error messages and documentation

**Target**: 60-80% reduction vs React/Vue for equivalent functionality.

### 2. Flat Structure (No Nesting)

```
✅ GOOD (Flat, explicit)
component/
  structure.adx
  behavior.adx.js
  style.adx.css
  manifest.json

❌ BAD (Nested, implicit)
component/
  src/
    components/
      internal/
        helper.tsx
```

**Rationale**: Agents scan entire directory trees. Flat = fewer tokens to locate files.

### 3. Separated Concerns (By File Extension)

Each aspect lives in its own file with predictable naming:
- `.structure.adx` → DOM structure
- `.behavior.adx.js` → Logic
- `.style.adx.css` → Styling
- `.manifest.json` → Metadata & public API

**Rationale**: Agents can target specific concerns without parsing unrelated code.

### 4. Explicit Everything

No implicit imports, no auto-wiring, no convention-over-configuration.

```js
// ✅ GOOD
import { Button } from './button/manifest.json'
export const deps = ['./icon/manifest.json']

// ❌ BAD
import Button from './Button' // magic resolution
```

**Rationale**: Agents can trace dependencies by reading files, no execution needed.

### 5. Manifest-Driven API

Every component exposes its contract via `manifest.json`:

```json
{
  "name": "UserCard",
  "version": "1.0.0",
  "props": {
    "name": { "type": "string", "required": true },
    "avatar": { "type": "string", "default": "/default.png" }
  },
  "emits": ["click", "hover"],
  "slots": ["actions"],
  "deps": ["./button", "./avatar"]
}
```

**Rationale**: Agents read JSON faster than parsing source code.

## Component Anatomy

### Structure File (`.structure.adx`)

Compact HTML-like syntax optimized for token efficiency:

```adx
<div .card>
  <img :src="avatar" .avatar>
  <h2>{{name}}</h2>
  <p>{{bio}}</p>
  <slot actions />
</div>
```

**Features**:
- `.class` shorthand (saves 7 chars per class)
- `:prop` shorthand (saves 6 chars per binding)
- `{{var}}` interpolation (standard, clear)
- `<slot name />` explicit slots

### Behavior File (`.behavior.adx.js`)

Pure functions, no classes:

```js
export function setup(props) {
  return {
    avatar: props.avatar || '/default.png',
    name: props.name,
    bio: props.bio
  }
}

export function onClick(state, event) {
  emit('click', { name: state.name })
}
```

**Features**:
- Pure functions (easy to reason about)
- Explicit state returns
- Explicit event handlers
- No reactivity magic

### Style File (`.style.adx.css`)

Semantic tokens + scoped styles:

```css
@use tokens;

.card {
  pad: tokens.space-4;
  bg: tokens.surface-1;
  radius: tokens.radius-md;
  shadow: tokens.shadow-sm;
}

.avatar {
  size: 48px;
  radius: tokens.radius-full;
}
```

**Features**:
- `@use tokens` imports design system
- Short property names (`pad`, `bg`, `radius`)
- Automatic scoping (no BEM needed)
- Token-based values (consistency by default)

### Manifest File (`manifest.json`)

Public API contract:

```json
{
  "name": "UserCard",
  "version": "1.0.0",
  "props": {
    "name": { "type": "string", "required": true },
    "avatar": { "type": "string", "default": "/default.png" },
    "bio": { "type": "string", "default": "" }
  },
  "emits": ["click"],
  "slots": ["actions"],
  "deps": []
}
```

## Mid-Level Patterns (Built-In)

ADX includes professionally designed patterns that agents can use directly:

- **Layout**: `grid`, `stack`, `sidebar`, `cluster`
- **Forms**: `form`, `field`, `input-group`, `validation`
- **Data**: `table`, `list`, `card-grid`, `infinite-scroll`
- **Feedback**: `toast`, `modal`, `alert`, `loader`
- **Navigation**: `nav`, `tabs`, `breadcrumb`, `pagination`

Each pattern includes:
- Responsive defaults
- Accessibility built-in (ARIA, keyboard nav)
- Design system integration
- Mobile-optimized touch targets

**Rationale**: Agents shouldn't reinvent common patterns. Use proven UX/UI.

## Token Optimization Strategies

### 1. Abbreviated Properties

Standard CSS is verbose for agents:

```css
/* Traditional: 45 tokens */
padding: 16px;
background-color: #ffffff;
border-radius: 8px;

/* ADX: 18 tokens */
pad: 16px;
bg: #ffffff;
radius: 8px;
```

### 2. Shorthand Bindings

```html
<!-- Traditional: 12 tokens -->
<img v-bind:src="avatar" />

<!-- ADX: 5 tokens -->
<img :src="avatar">
```

### 3. Class Shorthand

```html
<!-- Traditional: 8 tokens -->
<div class="card">

<!-- ADX: 4 tokens -->
<div .card>
```

### 4. Manifest Scanning

Agent can read `manifest.json` (50 tokens) instead of parsing entire component source (300+ tokens) to understand API.

## Runtime

ADX compiles to vanilla JavaScript:

```
.adx files → ADX Compiler → .js + .css + .html
                ↓
          Browser (no framework runtime)
```

**Build Output**:
- Standard ES modules
- Plain CSS (no runtime styling)
- Optimized DOM operations
- No virtual DOM overhead

## Quality Enforcement

Every component automatically gets:

1. **Accessibility Audit**: WCAG AA compliance checked at compile time
2. **Responsive Validation**: Breakpoint consistency verified
3. **Token Standards**: Design tokens enforced
4. **Performance Budget**: Bundle size limits per component

**Fail-Fast**: Builds fail if quality checks don't pass.

---

*Architecture designed for agents. Quality designed for humans.*
