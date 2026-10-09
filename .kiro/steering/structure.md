# Project Structure

## Repository layout

The repo **is** the ADX compiler: a single npm package (`adx`) rooted at the repo
root. There is no `compiler/` subdirectory — source, tests, and config live at root.

```
project_adx_0/              # npm package root (name: adx)
  package.json              # the adx package (bin: adx -> dist/cli.js)
  tsconfig.json  vitest.config.ts  eslint.config.js  .gitignore
  src/                      # compiler source (TypeScript, ESM)
    cli.ts                  # adx build / adx check entry
    compile.ts              # compile pipeline
    structure/              # .structure.adx tokenizer + parser + AST
    manifest/               # manifest.json loader + validator
    behavior/               # behavior.adx.js export scanner
    tokens/                 # design-token loader
    expr/                   # safe build-time expression evaluator
    codegen/                # html.ts, css.ts, glue.ts, scope.ts, context.ts
    errors.ts  source.ts  index.ts
  test/                     # Vitest suites (mirror src/)
  fixtures/user-card/       # golden example component (the four .adx files)
  tokens/design-tokens.json # design-system token source
  docs/
    agent-reference.md      # canonical agent reference (syntax, tokens, CLI, baselines)
    adx-grammar.md          # .structure.adx grammar — parser's contract
    architecture.md         # design pillars, runtime model, quality contract
    comparison.md           # ADX vs React/Vue/Svelte token analysis
    human-guide.md          # human onboarding guide
    token-efficiency.md     # token-cost analysis
  .kiro/steering/           # steering files (this directory)
  .agents/tasks/            # workflow run artifacts (plans, reviews)
```

Build artifacts (`dist/`, `node_modules/`) are gitignored.

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
