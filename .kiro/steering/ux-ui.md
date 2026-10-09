# UX/UI Defaults

ADX's "Quality by Default" pillar means every component must ship professional, accessible UI without the agent re-deriving best practices each time. This file is the always-on baseline. For richer, situational guidance (design systems, palettes, font pairings, stack-specific rules), use the `ui-ux-pro-max` skill as an on-demand tool — see "Design intelligence tool" below.

## Always apply (non-negotiable baseline)

These are the rules every ADX component must satisfy. They map onto the `.structure.adx` / `.style.adx.css` / `behavior.adx.js` split.

### Accessibility (WCAG AA)
- Decorative icons beside visible text are hidden from assistive tech (`aria-hidden`); meaningful standalone icons get a text alternative; icon-only controls get an accessible name.
- Color is never the only signal — pair it with text, icon, or shape.
- Body text contrast >= 4.5:1; large text and non-text UI (borders, control boundaries, meaningful icons) >= 3:1. Verify in both light and dark.
- Form fields have labels, hints, and clear inline errors; multi-error forms focus a linked error summary on submit.
- Focus order matches visual order; focus is never obscured by sticky/overlay UI.
- Drag/swipe-only actions have a button or keyboard alternative.
- Respect reduced-motion and large text-size settings without layout breakage.

### Interaction
- Interactive elements give pressed/hover feedback within ~80-150ms via color/opacity/elevation — never a layout-shifting transform.
- Disabled controls use real disabled semantics, reduced emphasis, and no action.
- One primary gesture per region; avoid nested tap/drag conflicts.
- Prefer semantic interactive primitives (`button`, `a`) over generic containers.

### Layout & spacing
- Use the design-token spacing scale (`space-*`) for all padding/gap/section rhythm — no arbitrary values.
- Keep a clear vertical hierarchy (e.g. 16/24/32/48) and a readable text measure (don't run paragraphs edge-to-edge on wide screens).
- Mobile-first; keep breakpoints consistent with the `breakpoint-*` tokens. Touch targets >= 44px.

### Visual
- Icons from one consistent family and style (consistent stroke width, filled vs outline per hierarchy level), sized via tokens.
- No emoji as structural/UI icons; vector only.
- Theme through semantic tokens (`surface-*`, `text-*`, etc.), never per-component hardcoded hex.

### Motion
- Subtle by default; exit faster than enter; use token-driven, platform-appropriate timing. Gate non-essential motion behind reduced-motion.

## How this maps to ADX files
- Accessibility semantics and structure -> `structure.adx` (roles, labels, `:if`/`:for`, slots).
- State, validation, focus management, event handlers -> `behavior.adx.js`.
- Tokens, contrast, spacing, responsive overrides -> `style.adx.css` (`@use tokens`).
- Prefer built-in patterns (form/field, modal, toast, table, nav, tabs) — they carry these guarantees so components don't reinvent them.

## Design intelligence tool (on demand)

For anything beyond the baseline — generating a product-wide design system, choosing styles/palettes/fonts, chart selection, or stack-specific implementation — invoke the `ui-ux-pro-max` skill rather than guessing. It is a searchable CLI (Python 3, offline) over curated datasets.

Use it when:
- Starting a new page/product and you need a coherent visual direction (`--design-system`).
- Picking a focused concern: style, color, typography, chart, ux, landing, icons (`--domain <name>`).
- Implementing for a known target stack (`--stack <name>`).

Keep queries to one dominant intent with 2-5 terms. Treat its output as recommendations that must still satisfy the always-apply baseline above and ADX's token-first conventions.

Note: this skill is installed at the user level, so full search needs it present on the machine. The always-apply baseline above is committed to the repo and holds regardless.
