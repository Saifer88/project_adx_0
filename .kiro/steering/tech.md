# Tech & Conventions

## Stack (planned)

ADX is a compile-to-vanilla framework. The intended pipeline:

```
.adx files -> ADX compiler -> .js + .css + .html -> browser (no framework runtime)
```

Build output targets standard ES modules and plain CSS, with no virtual DOM.

Nothing is built yet. No `package.json`, compiler, or CLI exists. When starting implementation, confirm the toolchain choice before scaffolding rather than assuming one.

## Planned CLI surface (from docs)

Documented but not implemented:

- `adx create <name>` — scaffold a project
- `adx dev` — dev server with hot reload
- `adx build` — production build
- `adx check` — validate components without building
- `adx tokens` — list design tokens
- `adx pattern <name>` — generate a pattern component

Treat these as the target design, not working commands.

## Design tokens

The design system is token-based. Full set lives in `docs/agent-reference.md`:

- Spacing on a 4px scale (`space-0` through `space-16`).
- Colors: `surface-0..3`, `text-1..3`, `primary`, `secondary`, `success`, `warning`, `error`, `info`.
- Radius: `radius-sm|md|lg|full`. Shadows: `shadow-sm|md|lg`.
- Typography: `text-xs..3xl`, `weight-normal|medium|bold`, `font-sans|serif|mono`.
- Breakpoints: `breakpoint-sm|md|lg|xl`.

Use tokens rather than raw values so output stays consistent and self-documenting.

## Quality bar (intended enforcement)

Components are meant to get these automatically at compile time:

- WCAG AA accessibility audit.
- Responsive breakpoint consistency.
- Design-token enforcement.
- Per-component bundle-size budget.

Builds are designed to fail fast when checks don't pass.

## Documentation style

Docs are optimized for LLM context windows: compact, scannable, exhaustive on syntax. Preserve that style when editing — favor reference tables, short examples, and explicit rules over prose.
