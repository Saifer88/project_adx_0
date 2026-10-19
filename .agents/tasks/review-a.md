# `adx serve` + npm publish-on-main — final pass, OTP token gap resolved

This pass reviews the four-commit `origin/main..HEAD` series that adds a static `adx serve` subcommand, renames the npm package to `project-adx-0` (CLI binary stays `adx`), and wires a publish-on-`main` GitHub Action guarded against republishing an existing version. The only change since the prior approving pass is commit `5032bd2`, a docs-only rewrite of the README maintainer-token section that now requires a 2FA-bypass granular token — this closes the one blocking finding (unattended publish could stall on an OTP prompt) carried in `npm-serve-review.json`. The serve traversal defense, content-type mapping, package metadata, and workflow posture are unchanged from the already-reviewed state and still hold against a direct re-read of the committed source.

Watch for: nothing blocking. Four low-severity carryovers remain, all previously acknowledged and documented — prerelease publishes to the `latest` dist-tag (possible), `serve` follows symlinks out of the served root (confirmed), `--host 0.0.0.0` exposes an unauthenticated file server (confirmed), and the publish workflow has no `concurrency` guard (confirmed). None gate shipping.

**Verdict**: APPROVED

## High-level view

The previously-blocking maintainer-token gap is resolved. The README now tells maintainers to mint a Granular Access Token scoped to `project-adx-0` with read/write **and** the "Bypass two-factor authentication (2FA)" box enabled, and it drops the now-removed classic/Automation-token fallback. That matches how the workflow authenticates — a non-interactive `npm publish` with only `NODE_AUTH_TOKEN` set and no path to answer an OTP challenge — so a 2FA-enforcing account would otherwise have stalled the publish step.

The serve traversal defense is layered and holds. A literal `..`-segment regex runs on the once-decoded raw path to guarantee the 403 contract, and a lexical containment check (`target === root || target.startsWith(root + sep)`) is the real backstop against anything the WHATWG URL parser normalizes. I re-derived the handler's decode/resolve logic against literal, encoded-slash, double-encoded, null-byte, and protocol-relative vectors: every escape attempt is either a 403 or stays clamped inside the root. The residual is symlink-following, which is lexical-only and documented.

The build/check guarantee is preserved by scoping `--port`/`--host` to the `serve` command. For `build`/`check` those flags are treated as unknown and skipped exactly as before, so `adx build --host <dir>` still consumes `<dir>` as the positional directory. The dispatch refactor (`run()` now takes a `ParsedArgs` instead of `argv`, with `main()` parsing once) leaves build/check output and exit codes identical, and the new `isEntryPoint()`/`realpathSync` guard is what lets the test suite import `parseArgs`/`serve` without the module exiting the process.

The publish workflow triggers only on push to `main` — not `pull_request` — so the npm token is never exposed to fork-originated runs, and `build`/`test` gate the publish step. The version guard publishes only when `npm view project-adx-0@<version>` comes back empty, which also handles the never-published-before case cleanly.

<details>
<summary>Issues (4)</summary>

1. **Prerelease publishes to `latest` (possible, low)** — `npm publish` with no `--tag` tags `0.1.0-alpha` as `latest`, so `npm install project-adx-0` would pull an alpha. Fine while it is the only version; add `--tag alpha` before a stable release coexists.
2. **Symlink escape from served root (confirmed, low)** — `statSync` follows symlinks and containment is purely lexical, so a symlink inside the served root pointing outside would be served. Documented as a known assumption; close with a `realpath` re-check if `serve` ever targets untrusted trees.
3. **`--host 0.0.0.0` is unauthenticated (confirmed, low)** — binding a non-loopback host serves build output to the LAN with no access control. Default `localhost` is safe and the exposure is documented in the serve help comment; no code change required for a local preview.
4. **No `concurrency` guard on the publish workflow (confirmed, low)** — two near-simultaneous `main` pushes could run the publish job concurrently; the version guard still prevents a duplicate publish of the same version, but a `concurrency: publish` group would avoid the race entirely.

</details>

<details>
<summary>Details</summary>

### Maintainer-token guide now supports unattended publish

The workflow runs `npm publish` non-interactively with `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` and `registry-url: 'https://registry.npmjs.org'` set on `setup-node`. There is no code path to answer a one-time-password prompt, so the token itself has to carry publish authority without a 2FA challenge. The prior passes flagged (likely, blocking) that the README told maintainers to create a granular token with read/write + expiry but omitted the 2FA-bypass setting, and offered a classic Automation token as a fallback that npm no longer issues. Commit `5032bd2` rewrites that step (docs-only, no workflow or CLI change): it requires a Granular Access Token scoped to `project-adx-0` with Read and write permission and the "Bypass two-factor authentication (2FA)" box enabled, calls out that the box is unchecked by default, drops the classic-token fallback, and links npm's CI/CD token guide. That closes the stall a 2FA-enforcing account would otherwise hit.

### Traversal defense: literal `..` gate plus lexical containment

The request handler decodes the path twice over — once as `decodeURIComponent(rawPath)` for the literal check and once as `decodeURIComponent(new URL(req.url, …).pathname)` for resolution — and defends in two layers:

```js
if (/(^|\/)\.\.(\/|$)/.test(decodedRaw)) { /* 403 */ }
const target = resolve(root, "." + pathname);
if (target !== root && !target.startsWith(root + sep)) { /* 403 */ }
```

The regex guarantees the documented 403 contract for any `..` segment that survives a single decode (covering `/../../etc/passwd` and `%2f`/`%2e` single-encoded forms). The containment check is the real backstop: because `pathname` always begins with `/`, `"." + pathname` is resolved relative to `root`, and `resolve` collapses `..` before the `startsWith(root + sep)` test, so anything that would climb above the root is rejected regardless of the regex. I traced the combined logic against literal `..`, encoded-slash `..%2f..%2f`, double-dot `%2e%2e`, double-encoded `%252e%252e`, null-byte `%00`, and protocol-relative `//etc/passwd` inputs: the first three hit the literal 403, double-encoding and the null byte stay clamped inside the root (a 404 against a nonexistent name, not an escape), and the protocol-relative form resolves its path component under the root. Malformed percent-encoding throws in `decodeURIComponent` and is caught as a 400. The one gap is that `statSync` follows symlinks and the containment check never calls `realpath`, so a symlink placed inside the root that points outside would be served — this is called out in the serve doc comment and tracked as a low-severity assumption appropriate for a loopback preview over trusted compiler output.

### Serve-only flag scoping keeps build/check byte-for-byte

`parseArgs` gates the new flags behind `const isServe = command === "serve"`, so for `build`/`check` the `--port`/`--host` branches are never entered. `--port`/`--host` then fall through the loop as unparsed `--`-prefixed tokens and are skipped by the positional branch, exactly as any unknown flag was before this change — the `does NOT consume --port/--host for build/check` test pins that `adx build --host fixtures/user-card` still lands `fixtures/user-card` in `dir`. The dispatch was restructured so `run()` now takes a parsed `ParsedArgs` rather than raw `argv`, with `main()` doing the single `parseArgs` call and routing `serve` to the long-running server (no `process.exit`) while every other command keeps going through `process.exit(run(args))`. The usage-error and missing-dir paths inside `run()` are untouched, so build/check stdout/stderr and exit codes are preserved. The sole importer of `cli.ts` is the new `test/serve.test.ts` (`parseArgs`, `serve`); the `run` referenced in `behavior-run.test.ts` is an unrelated local helper, so the signature change has no other callers.

### Entrypoint guard canonicalizes the invoked path

Because the module is now imported by tests, the CLI runs only under an `isEntryPoint()` guard rather than unconditionally. The guard resolves `process.argv[1]` through `realpathSync` and compares it to the realpathed `fileURLToPath(import.meta.url)`, wrapped in try/catch so an absent or unresolvable `argv[1]` returns false. This is what makes the installed `adx` bin (an npm symlink) dispatch — a lexical compare would never match the symlink target and would silently no-op. The coder's recorded iteration-3 symlinked-bin smoke test (`ln -s dist/cli.js /tmp/adx-link`, then `node /tmp/adx-link …`) shows the before/after flip from silent `exit 0` to real dispatch, consistent with the code.

### Publish workflow trust boundary

The trigger is `push: branches: [main]` only, with `permissions: contents: read`. There is no `pull_request` or `workflow_dispatch` trigger, so `secrets.NPM_TOKEN` is never available to a fork-originated run — only code already merged to `main` executes with the token, which is the correct posture for a publish job. `npm ci`, `npm run build`, and `npm test` precede the publish step and fail the job before it on any error. The guard, `PUBLISHED="$(npm view project-adx-0@"$VERSION" version 2>/dev/null || true)"` with an `[ -z "$PUBLISHED" ]` check, publishes on an empty result and skips otherwise; the suppressed stderr plus `|| true` makes the never-published E404 case publish correctly on first run. The `benchmark`/`test:browser` steps are deliberately absent to keep publish fast. The only gap is the lack of a `concurrency` group, which the version guard already neutralizes for duplicate publishes (low).

### Evidence and scope

Per the task, the `build`/`lint`/`test` suites were not re-run. The plan's iteration 2–4 evidence records them green (22 files, 209 tests), `npm pack --dry-run` showing `project-adx-0@0.1.0-alpha` limited to `dist/`, `tokens/`, `README.md`, the manual serve curl exercise (200 `text/html`, 200 `text/javascript` for `.js`, 403 literal and encoded-slash traversal, 404, 405, HEAD-no-body, invalid-port and EADDRINUSE handling), and `publish.yml` parsing clean via `js-yaml`. The evidence is specific and matches the committed source, so no suite re-run was warranted; the one spot-check I ran was an isolated re-derivation of the decode/containment logic for traversal vectors the recorded curl runs did not cover (double-encoding, null byte, protocol-relative), which confirmed the defense holds.

</details>

<details>
<summary>Files changed (origin/main..HEAD)</summary>

- `src/cli.ts` — `serve()` static server, serve-scoped `--port`/`--host` parsing, `CONTENT_TYPES`, literal-`..` + lexical containment traversal checks, listen error handler, host-aware startup line; guarded `main()` entry with `isEntryPoint()`/`realpathSync`; `run()` now takes `ParsedArgs`.
- `test/serve.test.ts` — parseArgs serve-option cases (incl. build/check non-consumption) + http routing/security/method tests; binds to `port: 0`.
- `package.json` — rename to `project-adx-0`, add `prepublishOnly` and `publishConfig: { access: public }`; `bin` `{ "adx": "dist/cli.js" }` and `files` `["dist","tokens","README.md"]` unchanged.
- `package-lock.json` — root `name` regenerated to `project-adx-0`; no dependency changes.
- `.github/workflows/publish.yml` — publish-on-`main` workflow, version-exists guard, `NODE_AUTH_TOKEN` from `secrets.NPM_TOKEN`, `registry-url` on `setup-node`.
- `README.md` — Install + CLI + end-to-end sections, maintainer 2FA-bypass token guide; `docs/agent-reference.md`, `docs/human-guide.md`, `docs/roadmap.md` document `serve` as implemented and the package rename; `adx dev`/hot-reload stays planned.
- `.agents/tasks/npm-serve-plan.md` — implementation plan and verification evidence.

Full diff: `git diff origin/main..HEAD`.

</details>
