# Verification — `adx create <path>/<component-name>` (nested component paths)

Branch: `feat/create-nested-path`. All commands run from the worktree root
`/Users/pirrima001/coding/personal/project_adx_0/.worktrees/create-nested-path`.

## Unit/integration tests

### Targeted (during development)

```
npx vitest run test/create.test.ts test/cli-commands.test.ts
```

Result: `Test Files 2 passed (2)`, `Tests 62 passed (62)`.

### Full suite

```
npm test        # vitest run
```

Result: `Test Files 28 passed (28)`, `Tests 374 passed (374)`.

Baseline was 349 tests; grew by 25 (new nested-path + `parseComponentPath` +
CLI-dispatch cases in `test/create.test.ts`). No regressions — every pre-existing
suite still passes, including the byte-for-byte `usage()` regression in
`test/cli-commands.test.ts` and the `adx help` listing test.

## Build

```
npm run build   # tsc -p tsconfig.json
```

Result: exit 0, no TypeScript errors.

## End-to-end against the BUILT CLI

Ran in a throwaway temp dir (`mktemp -d`), using the built `dist/cli.js`.
`--tokens` points at the repo's `tokens/design-tokens.json` because a bare temp
dir has no tokens file (standard check/build token resolution, unrelated to
nested paths); no `--data` was used — every prop defaults.

```
CLI=.../dist/cli.js
TOKENS=.../tokens/design-tokens.json

node "$CLI" create landing/footer
# stdout:
#   landing/footer/manifest.json
#   landing/footer/structure.adx
#   landing/footer/behavior.adx.js
#   landing/footer/style.adx.css
# exit 0

find landing -type f
#   landing/footer/behavior.adx.js
#   landing/footer/manifest.json
#   landing/footer/structure.adx
#   landing/footer/style.adx.css

grep '"name"' landing/footer/manifest.json
#   "name": "Footer",        <-- PascalCase from LAST segment only

node "$CLI" check landing/footer --tokens "$TOKENS"
#   OK
# exit 0

node "$CLI" build landing/footer --tokens "$TOKENS"
#   Built Footer -> dist/footer
# exit 0
find dist -type f
#   dist/footer/behavior.js
#   dist/footer/glue.js
#   dist/footer/index.html
#   dist/footer/style.css
```

### Rejection case (end-to-end)

```
node "$CLI" create landing//footer
#   [ADX] landing//footer - invalid component path (lowercase, hyphenated segments; no empty, '..', backslash, or absolute paths)
# exit 1
# afterwards: only `landing/` from the earlier success existed; the rejected
#   create wrote nothing.
```

Temp dir removed afterward (`rm -rf`).

## Conclusion

Nested paths of arbitrary depth scaffold the four files under
`<prefix>/<lastSegment>/`, the PascalCase manifest `name` derives from the last
segment only, the flat single-segment case is unchanged, invalid/empty/`..`/
backslash/absolute inputs are rejected (exit 1, nothing written), and the
conflict-safe no-partial-write guard is preserved. Build + full test suite green.
