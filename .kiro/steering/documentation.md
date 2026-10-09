# Documentation Upkeep

Keeping docs current is part of the definition of done, not a follow-up task. ADX serves two audiences and both must stay in sync whenever behavior, syntax, tokens, or the toolchain changes.

## Two audiences, two surfaces
- **AI agents**: `docs/agent-reference.md` is the canonical, token-efficient reference (syntax, tokens, patterns, baselines). Keep it compact and scannable — reference tables, short examples, explicit rules, minimal prose.
- **Humans**: `README.md` and `docs/human-guide.md` carry onboarding, rationale, and worked examples in a friendlier tone.
- Supporting docs: `docs/architecture.md` (design decisions), `docs/comparison.md`, `docs/token-efficiency.md`, and `docs/adx-grammar.md` (the `.adx` grammar spec).

## When code changes, update docs in the same change
- New or changed `.adx` syntax or token -> update `docs/adx-grammar.md` and `docs/agent-reference.md`; mirror the human-facing explanation in `docs/human-guide.md`.
- New or changed CLI command -> update the CLI sections in `docs/agent-reference.md` and `docs/human-guide.md`.
- New compiler capability or build output -> update `docs/architecture.md`.
- Keep `README.md` status/version accurate as milestones land.

## Mark reality vs. intent
Until a feature actually works, label documented-but-unbuilt behavior as planned (per the product steering). When a milestone ships, flip the relevant docs from "planned" to real and note it in the README status.

## Style
Match each doc's existing voice: compact/reference for agent-facing, warm/explanatory for human-facing. Prefer editing the canonical location once over duplicating content across files.
