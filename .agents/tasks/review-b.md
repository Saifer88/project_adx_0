# npm-published ADX CLI with static local preview

This change prepares ADX for publication as `project-adx-0`, retains `adx` as the installed command, adds static local serving, and publishes new versions from `main`. The README puts the global install and correct `npx -p project-adx-0 adx …` form near the top, documents build/serve/check, preserves the alpha and measured-savings caveats, and includes a build-to-browser example. The recorded build, lint, test, package, installed-bin, and manual-serve evidence is complete. Watch for: **likely, blocking** the first-release instructions require restricting a granular token to `project-adx-0`, but that package does not yet exist on npm and cannot be selected as a package-specific resource before its initial publication.

**Verdict**: NEEDS_CHANGES

## High-level view

The public install surface is internally consistent: `npm install -g project-adx-0` is tied to the global `adx` binary, the no-install form correctly uses `npx -p project-adx-0 adx`, and the example builds the UserCard fixture before serving its generated directory. Build, check, and static serve are separated accurately; `adx dev` and hot reload remain planned. Version `0.1.0-alpha`, the 13.3–13.8% measured source-reading reduction, and the 60–80% target remain distinct.

Serve-only options are consumed only for `serve`; the existing build/check parse branches and component/page execution bodies are unchanged, while shared usage gains the intended serve line. The server covers generated MIME types, GET/HEAD, directory indexes, concise failures, decoded traversal rejection, lexical root containment, and npm-bin-safe entrypoint detection.

The workflow publishes from `main`, skips versions already on npm, and exposes `NPM_TOKEN` only to the publish step. The prior interactive-OTP blocker is fixed with a bypass-2FA granular token. A new first-publication gap remains: **likely, blocking**, the registry returns E404 for `project-adx-0`, so the package-specific token step cannot be completed until a broader or manual bootstrap publication creates the package.

<details>
<summary>Issues (1)</summary>

1. **First-publish token cannot be package-scoped (likely, blocking)** — `project-adx-0` does not yet exist, so it cannot be selected for the package-restricted token required by the README. Document a temporary broader token plus immediate rotation, or a manual first publish followed by a package-scoped Actions token.

</details>

<details>
<summary>Details</summary>

### First publication cannot use the documented package-scoped token

**Likely, blocking:** `README.md:44` requires scoping the granular token to `project-adx-0` before adding it as `NPM_TOKEN`. The targeted check `npm view project-adx-0 version --json` returned E404, confirming that the package has not been created. npm’s granular-token package selector operates on package resources the account can already select, so this nonexistent package cannot be selected while preparing the workflow intended to create it.

Keep the corrected 2FA-bypass requirement, but add a viable bootstrap path. For a pipeline-driven first release, use a short-lived granular token with read/write access broad enough to create the package and 2FA bypass enabled, publish once, then replace it with a token restricted to `project-adx-0`. Alternatively, publish the first version manually with OTP and configure the package-restricted Actions token afterward.

### Static preview preserves build/check behavior

Traversal is rejected on the decoded raw path before URL normalization and again through lexical containment after resolution. The installed CLI guard realpaths npm’s bin symlink before comparing it with the ESM module path, closing the no-op installed-command bug from an earlier pass.

For build/check inputs, the `--port` and `--host` branches are gated by `command === "serve"`; the prior `--out`, `--tokens`, `--data`, and positional branches remain unchanged. `runComponent`, `runPage`, and asset writing are unchanged in the diff, and `main()` passes the once-parsed object into the same non-serve dispatch. The only intentional shared-output difference is the added `adx serve` usage line.

### Documentation and recorded evidence

`docs/agent-reference.md` lists `serve` under implemented commands, `docs/human-guide.md` explains that it previews already-built output, and `docs/roadmap.md` distinguishes shipped static serving from planned hot reload. The package-name sweep changes distribution identity while leaving the `adx` command, `@adx/patterns`, `data-adx-*`, `.adx` extensions, tokens, and the ADX display name intact.

Per instruction, no project suite was rerun. The coder’s evidence records clean build and lint runs, 22 passing files/209 tests, package dry-run contents, parsed workflow YAML, installed-bin dispatch, and manual serve coverage for MIME types, traversal, missing files, unsupported methods, invalid ports, and address conflicts. The only spot-check was the registry lookup needed to resolve the first-publication ambiguity. Earlier blockers involving npm-bin symlink dispatch, test-port collisions, and interactive OTP setup are fixed; previously accepted low-severity trade-offs are not duplicated here.

</details>

<details>
<summary>File map</summary>

- `.github/workflows/publish.yml` — builds, tests, checks the registry version, and publishes from `main` with `NPM_TOKEN`.
- `README.md` — adds AI-first installation, CLI usage, end-to-end preview, publish behavior, and maintainer token setup.
- `docs/agent-reference.md`, `docs/human-guide.md`, `docs/roadmap.md` — synchronize package naming, implemented static serve, and planned hot reload.
- `package.json`, `package-lock.json` — rename the npm package and configure public publication while retaining the `adx` bin.
- `src/cli.ts` — adds static serving, serve-only options, long-running dispatch, traversal handling, and npm-bin-safe entry detection.
- `test/serve.test.ts` — covers serve parsing, response behavior, traversal, and OS-assigned test ports.
- `.agents/tasks/npm-serve-plan.md` — records implementation and verification evidence.

Full diff: `git diff origin/main...HEAD` (`git diff main` is empty because the feature is already committed on local `main`; only review artifacts are untracked).

</details>
