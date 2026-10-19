# Embedded, guarded `adx init` starter scaffolding

This change adds `adx init [name]`, which writes a seven-file starter containing one complete component, a root page manifest, project tokens, and a README. Embedded templates, defaulted props, and an exact token snapshot make the result compatible with the real current compiler without `--data`. A complete destination preflight protects partial-existing scaffolds, while the new dispatch leaves build/check/serve argument parsing unchanged. Vitest coverage, recorded built-CLI checks, and synchronized user/agent/roadmap documentation cover the shipped workflow.

Watch for: none; the previously confirmed raw, ungated Dismiss transition has been removed from `HEAD` without weakening hover or active feedback.

**Verdict**: APPROVED

## High-level view

All generated content lives in string constants emitted into `dist/scaffold.js`, so a global npm installation has no runtime dependency on repository fixtures or source templates. The manifest defaults both props, and a regression test holds the embedded token template byte-identical to the repository token source.

`scaffoldProject` checks all seven final paths before creating any parent directory. A conflict late in scaffold order therefore returns non-zero through `run()` without leaving earlier component or token files behind; tests cover both existing-empty and nonexistent targets.

The CLI change adds one command branch and no parser options. `parseArgs` is unchanged, including the `command === "serve"` gate around `--port` and `--host`, and `main()` still reserves the long-running path for `serve`.

The starter emits static greeting content through semantic `<article>`, `<h1>`, `<p>`, and `<button>` elements. Spacing, colors, radius, shadow, typography, and the minimum touch height use real tokens; Dismiss feedback has no transform, animation, or hardcoded color.

The docs move minimal project scaffolding into the implemented CLI while keeping richer `create`, patterns, and hot reload planned. The plan records green build, lint, 217-test, and built-CLI component/page checks; no suite was rerun for this review as requested.

<details>
<summary>Issues (0)</summary>

No actionable concerns remain.

</details>

<details>
<summary>Details</summary>

### Defaulted props and embedded tokens satisfy the real compiler contract

The generated `manifest.json` gives `title` and `message` defaults and marks neither required, avoiding the compiler’s missing-required-prop path for `adx build hello-card`. The root `index.json` composes `./hello-card`, while the printed and generated README workflow changes into the project before building so the compiler finds `tokens/design-tokens.json` through its real working-directory-relative default.

The tests write the scaffold to a temporary directory and call the production `compileComponent` and `compilePage` functions. Assertions cover resolved greeting text, absence of interpolation markers and unresolved tokens, a full root-page document, and one `<h1>` with no skipped level. The recorded built-CLI check covers the process boundary: built `dist/cli.js` scaffolds, builds, and checks both targets, producing `dist/index.html` for the existing static server.

### Full destination preflight makes a partial scaffold non-destructive

```
resolve seven destination paths
        |
check every path -- conflict --> throw [ADX] error --> run() returns 1
        |
     no conflict
        |
create parents and write all seven files
```

The clobber test pre-creates `index.json`, which follows the component and token entries in scaffold order, then verifies that the component manifest, token file, and README remain absent. This proves the complete set is checked before mutation rather than writing until a conflict is encountered. Direct scaffolding starts with an empty directory, the named CLI case starts with a nonexistent child, and the CLI conflict case pins `[ADX]` stderr plus status 1.

### `init` preserves build/check/serve argument boundaries

`parseArgs` is byte-for-byte outside the change: only `serve` consumes `--port` and `--host`, no init-specific or global option was added, and the existing first positional field supplies the optional project name. The `init` branch precedes build/check’s required-input guard so omission means CWD, while `main()` retains the separate long-running serve path. Recorded verification includes the existing serve-flag non-consumption regression test plus new bare-init, named-init, output, and clobber dispatch cases.

### Static starter output meets the accessibility and token baseline

The compiled greeting is present in HTML before JavaScript, the single-card page has exactly one `<h1>`, and Dismiss is a semantic button with a token-derived 48px minimum height. Its normal and hover colors resolve from the supplied token file. The final follow-up removes the prior raw `0.12s` transition; hover and active feedback remain immediate, with no reduced-motion override needed and no layout-shifting transform.

</details>

<details>
<summary>File map</summary>

- `src/scaffold.ts` — embeds the starter and performs all-target collision preflight before writing.
- `src/cli.ts` — exposes `init`, prints next steps, and routes one-shot success or failure without changing parser flags.
- `test/init.test.ts` — covers the file set, token snapshot, clobber atomicity, real compiler calls, heading/touch baseline, and CLI dispatch.
- `README.md` — adds the published init/build/serve flow and shipped scaffold status.
- `docs/agent-reference.md` — marks `init` implemented in the compact agent reference.
- `docs/human-guide.md` — adds the starter walkthrough and updates the working command list.
- `docs/roadmap.md` — records minimal scaffolding as shipped while preserving richer planned commands.
- `.agents/tasks/init-plan.md` — records implementation decisions and verification evidence.

Full diff: `git diff db43186^..HEAD`.

</details>
