# `adx init` starter: ungated Dismiss motion removed (iteration 3)

This pass reviews commit `8e42642`, the fix for the single blocking finding carried from the prior round (`init-review.json`, source `init-review-b`): the starter `hello-card` `.dismiss` control declared `transition: background-color 0.12s ease, opacity 0.12s ease` with no `prefers-reduced-motion` override and a non-token duration, violating the token-driven + reduced-motion motion baseline. The commit applies the reviewer's narrowest fix — it deletes the `transition` declaration (and the stale "no layout-shifting transform" comment above it) and nothing else. The `.dismiss:hover` (background → `secondary`) and `.dismiss:active` (opacity `0.85`) rules stay, so pressed/hover feedback is now an instant color/opacity change with no animated motion left to gate. The scaffold file set, clobber guard, embedded templates, CLI dispatch, tests, and docs are unchanged from the prior iteration.

Watch for: nothing blocking. One pre-existing non-blocking cosmetic item persists (CSS comments inside `.dismiss` fold into the next declaration in the emitted `style.css`); both prior reviewers accepted it as "no action required," and this commit neither worsens nor touches it.

**Verdict**: APPROVED

## High-level view

The blocking finding is fixed by removal, not by papering over. With the `transition` gone, the `.dismiss` style carries only static declarations plus two pseudo-class rules that swap a color and an opacity on `:hover`/`:active`. That is an instant, non-layout-shifting feedback — squarely inside the ~80–150ms interaction window — so there is no motion to animate and therefore no `prefers-reduced-motion` override is required. The removal is confined to `src/scaffold.ts`; the touch-target `min-height: tokens.space-12` (48px) the previous iteration added is untouched, and the test that asserts `min-height` survives into the emitted CSS still pins it.

Nothing else in the change moved. `parseArgs` is still byte-for-byte unchanged — the `const isServe = command === "serve"` gate remains the only consumer of `--port`/`--host`, and `init` reuses the existing first-positional capture with no new global flag — so build/check/serve argument handling cannot have regressed. The `init` dispatch sits inside `run()` ahead of the `if (!args.dir)` guard (bare `adx init` → CWD) and shares the `try/catch` that turns the clobber `[ADX]` throw into stderr + exit 1. Templates remain embedded string constants writable from any CWD, the clobber guard is still a check-all-paths-then-write two-pass that leaves a partial-conflict directory untouched, and the four synced docs mark `init` shipped while keeping `create`/`dev`/`tokens`/`pattern` planned.

The recorded iteration-3 evidence (build exit 0, lint exit 0, `npm test` 217 passed including the `test/serve.test.ts` parseArgs non-consumption case, and a built-CLI e2e where `grep transition dist/` returns zero matches, the page has one `<h1>` and zero `<h2>`, and a repeated `init` exits 1 writing nothing) matches what the diff and current source show. Per the task I did not re-run the suites; the evidence is specific and the one code change is a pure deletion with no articulable doubt that would warrant a spot-check.

<details>
<summary>Issues (1)</summary>

1. **CSS comments fold into the next declaration (non-blocking, confirmed by prior passes, accepted)** — the two `/* … */` comments inside `.dismiss` in `style.adx.css` are emitted as a prefix to the following declaration in the generated `style.css`. Output is valid CSS and all token values resolve correctly; purely cosmetic generated-formatting. Already triaged "no action required" by both prior reviewers; carried forward unchanged. A future codegen pass could strip or re-indent inline comments.

</details>

<details>
<summary>Details</summary>

### Motion-baseline fix verified against the current source

`src/scaffold.ts` `STYLE` now ends the `.dismiss` block at `cursor: pointer;` with no `transition`, followed by:

```css
.dismiss:hover {
  bg: tokens.secondary;
}

.dismiss:active {
  opacity: 0.85;
}
```

A color swap and an opacity swap, applied with no `transition`, change state instantly on interaction. The baseline requires non-essential motion to be gated behind reduced-motion and timing to be token-driven; with the animated `transition` deleted there is neither a non-token duration nor any motion to gate, so the fix closes the finding at the narrowest scope rather than adding a timing token plus a media override. This is the only functional edit in the commit.

### The deletion left the rest of the starter intact

The removed declaration sat between `cursor: pointer;` and the `:hover` rule, so deleting it touches no other property: `min-height: tokens.space-12` (48px ≥ the 44px touch target) is still present and `test/init.test.ts` still asserts it survives into the emitted CSS. The clobber guard, embedded templates, defaulted-props manifest, token-drift test, and `parseArgs`/docs surface are byte-for-byte what the earlier passes already cleared — this commit is a one-line deletion, so none of that could have shifted.

</details>

<details>
<summary>File map</summary>

- `src/scaffold.ts` — removed the `.dismiss` `transition` declaration and its stale comment; `:hover`/`:active` feedback retained.
- `.agents/tasks/init-plan.md` — iteration-3 verification note recording the addressed blocking finding and the green gates.

Full diff: `git show 8e42642` (iteration-3 fix); `git diff 654a92a..HEAD` for the whole `adx init` change.

</details>
