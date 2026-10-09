# Project Structure

## Repository layout

```
project_adx_0/
  README.md              # Project overview and mission
  docs/
    agent-reference.md   # Source of truth for agents (syntax, tokens, patterns)
    architecture.md      # Design pillars and component anatomy
    comparison.md        # ADX vs React/Vue/Svelte token analysis
    human-guide.md       # Onboarding guide for human developers
    token-efficiency.md  # Detailed token-cost analysis
  .kiro/
    steering/            # Steering files for Kiro
```

No source code exists yet. When implementation begins, follow the component conventions below.

## Component conventions (from the design spec)

Every component is a flat directory holding exactly four files. No nesting.

```
component-name/
  manifest.json      # Public API: props, emits, slots, deps
  structure.adx      # DOM structure (compact HTML-like syntax)
  behavior.adx.js    # Logic as pure functions
  style.adx.css      # Scoped styles using design tokens
```

Rationale for flatness: agents scan directory trees, so flat layouts cost fewer tokens to navigate. Separated concerns let an agent target one file without parsing the rest.

## Key syntax (keep token cost low)

- `.className` instead of `class="className"`.
- `:prop="value"` for property binding, `@event="handler"` for events.
- `{{var}}` for interpolation; `:if` / `:else` / `:for` for control flow.
- Behavior: pure functions only. `setup(props)` returns state; `on<Event>(state, event)` handles events; `get<Name>(state)` computes values; `emit(name, data)` fires events.
- Style: `@use tokens` then abbreviated properties (`pad`, `bg`, `radius`, `size`, `weight`) with `tokens.*` values.

## Working rules

- Read `manifest.json` first to understand a component's contract before parsing source.
- Edit the single file matching the concern (structure / behavior / style); update `manifest.json` only when the API changes.
- Prefer built-in patterns over hand-building common UI.
- Keep docs in sync: `docs/agent-reference.md` is the canonical syntax reference. If syntax or tokens change, update it.
