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

**Measured (M2)**: the reproducible benchmark (`npm run benchmark`,
`gpt-tokenizer` o200k_base) shows ~13-14% on single-component understand /
modify-style / add-prop tasks against a faithful minimal React equivalent — well
below the aspirational target. The gap is expected to widen at multi-file /
multi-component scale (manifest scanning, built-in patterns), which this
single-component fixture does not capture. See `docs/token-efficiency.md` and
`docs/comparison.md` for the measured table and the honest claim.

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

Deterministic setup and synchronous state-mutating handlers, no classes:

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
- Explicit setup and per-instance state ownership
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

## Mid-Level Patterns (Planned)

The following library is a design proposal, not a shipped package:

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

**Milestone 1 + 2 (implemented).** `adx build <dir>` emits four files per
component into `dist/<name>/`; `adx build <page.json>` composes several components
into one `index.html` per crawlable URL. The per-component output:

- `index.html` — a complete static document. The HTML emitter resolves every
  `{{interpolation}}` and `:prop` binding at build time, applies `:if`/`:else`
  (falsy branches are omitted) and unrolls `:for`, and projects slot content (a
  standalone build leaves a `data-adx-slot="<name>"` placeholder; a composed child
  gets the parent's projected content baked in). Elements the component owns carry
  a deterministic `data-adx-c="<scopeId>"`; each instance root carries
  `data-adx-i="i<ordinal>"`; nodes with bindings/events/interpolation also carry a
  stable three-part `data-adx-b="<scopeId>-i<ordinal>-<n>"` hook. **Zero `{{`
  remain** — this is the SEO contract (a crawler that never runs JS sees the full
  content).
- `style.css` — the CSS transform strips `@use tokens;`, expands abbreviated
  properties, resolves every `tokens.*` to its design-token value, scopes each
  selector by attaching `[data-adx-c="<id>"]`, and passes `@media` through with
  `tokens.breakpoint-*` resolved to px. An unknown token fails the build with
  `[ADX] style.adx.css:<line> - Unknown token "..." (available: ...)`.
- `glue.js` — a **hydration-only, per-instance** ES module (no shared runtime, no
  vDOM). It imports the behavior exports from `./behavior.js` and loops over an
  `INSTANCES` array: for each instance it builds its own `setup(props) → state`,
  locates its root by `data-adx-c`+`data-adx-i`, wires each `@event` to its
  handler, and — on handler return — patches only that instance's hooked
  text/attributes. It contains no `createElement`: content lives in the HTML; the
  glue only wires interactivity and patches in place.
- `behavior.js` — the component's `behavior.adx.js` copied verbatim (it is
  already plain ES-module JS). The glue imports `setup`/`on<Event>` from this
  file. At build time the compiler **name-scans** this source to wire handlers and
  **executes** `setup()` (and any referenced `get*()`) in a sandbox to compute the
  state it bakes into the HTML (see Build-time execution below).

`scopeId` is deterministic (`c` + first 7 hex of `sha256(name \0 location)`), so
repeated builds are byte-stable. `location` is the directory basename for a
single-component build (M1-stable) and the repo-relative POSIX path for page and
composed children, so two deps with the same basename in different folders never
collide.

### Build-time execution of `setup()` (Trusted Code)

To emit real content, `build` and `check` execute `setup()` and referenced
computed functions in a Node `vm` context under a 1000ms timeout. The browser
re-runs setup with the same merged props; determinism is the author's responsibility.

**Compiling runs trusted user code.** Removing global names does not remove host
capabilities: exposed objects and their constructors can reach the host realm.
Node `vm` is not a security sandbox, and the timeout does not bound all resource
use. Do not compile untrusted dependencies in a privileged environment.
Untrusted builds need OS/container isolation with filesystem/network restrictions,
no credentials and resource limits. A child process or worker alone is insufficient.

Top-level and composed components share `compileInstance`; the composer supplies
props, tokens and projected slots. Each hydration instance carries its own hooks
and lexically scoped state. Asset emission is shared by page and standalone builds,
with collision-safe names. Acorn supplies export source ranges; JSON-LD escapes
HTML script delimiters without changing parsed metadata.

### Reactivity (patch model, no vDOM)

When a handler returns, the glue re-evaluates and patches **only** the affected
hooked nodes' text/attributes for **that instance** — no vDOM, no full re-render,
no `setup()` re-run. The model is deliberately bounded in M2: no structural
reactivity (`:if`/`:else`/`:for` are build-time only); computed-backed
interpolations (`{{displayName}}` from a `getDisplayName`) are frozen at their
build-time value and never live-patched; only `state`/`props`/loop-local
references update. The first patch after hydration is a no-op for a deterministic
`setup()`.

## Quality Enforcement

Every component automatically gets:

1. **Accessibility Audit**: WCAG AA compliance checked at compile time
2. **Responsive Validation**: Breakpoint consistency verified
3. **Token Standards**: Design tokens enforced
4. **Performance Budget**: Bundle size limits per component

**Fail-Fast**: Builds fail if quality checks don't pass.

### UX/UI Contract (enforced baseline)

"Quality by Default" is a framework contract, not a suggestion. Every component meets this baseline — the compiler audit checks it, and agents follow it when generating code.

**Accessibility (WCAG AA)**
- Decorative icons hidden from assistive tech; meaningful icons get text alternatives; icon-only controls get accessible names.
- Color is never the sole signal.
- Contrast: body text >= 4.5:1; large text and non-text UI >= 3:1; verified in light and dark.
- Form fields carry labels, hints, inline errors; multi-error forms focus an error summary on submit.
- Focus order matches visual order and is never obscured; drag/swipe actions have keyboard alternatives.
- Reduced-motion and large text-size settings never break layout.

**Interaction**
- Pressed/hover feedback within ~80-150ms via color/opacity/elevation, never a layout-shifting transform.
- Real disabled semantics; one primary gesture per region; semantic primitives over generic containers.

**Layout & spacing**
- Token spacing scale (`space-*`) for all rhythm; consistent vertical hierarchy; readable text measure.
- Mobile-first with `breakpoint-*` tokens; touch targets >= 44px.

**Visual & motion**
- One icon family, consistent stroke and fill discipline, token-sized; vector only, no emoji icons.
- Semantic token theming (`surface-*`, `text-*`), never per-component hardcoded hex.
- Motion is subtle by default, exits faster than it enters, and respects reduced-motion.

The planned pattern library aims to provide these guarantees. They are currently
authoring requirements, not compiler-enforced guarantees.

---

*Architecture designed for agents. Quality designed for humans.*
