# ADX Milestone 2 — Technical Design

Status: revision 3 (addresses the revision-2 `design-review.md` /
`design-verdict.json` — CHANGES_REQUESTED, 2 HIGH / 3 MEDIUM / 4 NIT; the prior
rounds' findings remain resolved). The sole remaining subsystem with open
findings was Phase 3 component composition and its per-instance runtime
identity. Every finding is resolved below and summarized in "Responses to design
review (revision 3)" at the end.

**Hard design constraint (pre-decided by the user, not re-litigated).** Hydration
glue is **PER-INSTANCE, not per-component**. When a component appears N times on a
page, the emitted glue must query **all** of that component's instance roots and,
for **each** matched root, instantiate its **own** `state` object (its own
`setup(props)` from its own props) and hydrate **only** that root's subtree.
Events, `emit`, and the reactivity patch (`rerender`) resolve against the
**nearest enclosing instance root** of the node that fired — never a single
shared root. Each instance gets a distinct instance id via the additive
`instanceBindingId(scope, i, n)` so `data-adx-b` and root selection are
unambiguous per instance. This per-instance model is a locked input to this
revision and is the shape every HIGH/MEDIUM resolution below conforms to.
Scope: all six M2 phases in one milestone (locked). Target package: the single
`adx` npm package at the repo root. All file paths below are relative to the
worktree root `.worktrees/adx-m2/`.

## Overview

M2 turns the M1 "compiles one demo component from manifest defaults" compiler
into something an AI agent can use to build a real, crawlable, multi-page site,
and backs the token-efficiency claim with measured numbers. It introduces five
new capabilities on top of M1's parse→scan→emit pipeline: (1) real data binding
driven by `--data` plus **sandboxed `setup()` execution** to compute true
build-time state; (2) a JSON **page manifest** that composes components into one
`index.html` per crawlable URL; (3) **component composition** (resolving custom
tags against `manifest.deps`, projecting slot content, passing props child-ward,
isolating scoped CSS); (4) an explicit **reactivity contract** that patches only
the affected hooked nodes' text/attributes on handler return — no vDOM; and (5) a
reproducible **token benchmark** that replaces the hand-estimated comparison
figures with tokenizer-measured ones.

The non-negotiable constraints hold throughout: token-first; SEO static-first
(complete HTML emitted at build time, zero `{{` left, glue only hydrates);
error format `[ADX] <file>:<line> - <message>` (manifest/page errors omit the
line); and docs synced for both audiences in the same change, marking only what
actually works as real.

The design deliberately keeps M1's seams intact and additive. `compileComponent`
stays the single-component entry; a new `compilePage` orchestrates composition on
top of it; the HTML emitter grows a component-resolution branch and a richer hook
record; the glue emitter grows a patch path; `setup()` moves from "scanned, never
executed" to "executed in a sandbox" for state resolution while the scanner
remains for handler-name wiring.

## Technology stack (locked once approved)

- Language/runtime: TypeScript 5.7, ESM, Node >= 18 (unchanged from M1).
- Test runner: Vitest 2.1 (unchanged). New suites mirror `src/` under `test/`.
- Sandbox: Node's built-in `node:vm` (`vm.createContext` + `script.runInContext`
  with a `timeout`). No third-party sandbox dependency — `vm` is sufficient for
  the threat model (deny ambient capabilities by omitting globals) and adds zero
  supply-chain surface. (See "Sandbox" risk note on `vm`'s known limits.)
- Benchmark tokenizer: `gpt-tokenizer` (pure-JS, no native build, MIT, actively
  maintained), pinned to an exact version, added as a `devDependency`. Chosen
  over `tiktoken` because `tiktoken` ships a WASM/native binding that complicates
  `npm run benchmark` on contributor machines and CI; `gpt-tokenizer` is pure JS
  and installs cleanly everywhere. The benchmark is dev-only, so it never enters
  the published `files` allowlist (`dist`, `tokens`, `README.md`).
- No runtime dependencies added to the shipped package. The compiler stays
  dependency-free at runtime; `vm` is a core module.

## M1 seams this design builds on (verified by reading the source)

- `src/compile.ts`: `compileComponent(dir, opts)` runs manifest→parse→scan→
  tokens→emit and returns `{ html, css, glue, manifest }`; `wrapDocument` builds
  the full HTML document and injects SEO meta from `manifest.seo`. The build
  scope is `{ state: defaultProps(manifest), props: defaultProps(manifest) }` —
  `setup()` is **not** executed today; `defaultProps` only pulls manifest
  `default` values.
- `src/codegen/html.ts`: `emitHtml(ast, ctx)` returns `{ html, hooks }`.
  `BindingHook = { id, events:{event,handler}[], bindings:string[] }`. Owned
  elements get `data-adx-c="<scopeId>"`; bound/evented nodes also get
  `data-adx-b="<scopeId>-<n>"`. `emitSlot` already emits
  `<slot data-adx-slot="<name>" data-adx-c="…"></slot>` placeholders. Custom
  tags are emitted verbatim as elements today (no resolution).
- `src/codegen/glue.ts`: `emitGlue(hooks, ctx)` imports behavior exports, calls
  `setup(props)` once, wires `@event`→handler, exposes a bubbling `emit`. No
  patching exists yet; `props` come from manifest defaults with an optional
  `globalThis.__ADX_PROPS__` override (verified in `glue.ts` — it reads
  `globalThis`, not `window`).
- `src/codegen/css.ts`: `transformCss` scopes every selector by attaching
  `[data-adx-c="<id>"]`; the `scopeId` is deterministic
  (`c`+sha256(name\0dirBasename)[:7], `src/codegen/scope.ts`). This already gives
  per-component CSS isolation we reuse for composition.
- `src/structure/parser.ts` + `ast.ts`: parser does **not** distinguish custom
  component tags from HTML (grammar §1); slots parse to `SlotNode{name,classes}`;
  duplicate slot names already error. `ElementNode.bindings` carry the resolved
  `Expr`/template needed to re-evaluate on reactivity.
- `src/manifest/load.ts` + `types.ts`: `deps: string[]` already validated;
  `PropDef{type,required?,default?}`; `SeoMeta{title,description,schema}`.
  Manifest errors use `adxFileError` (line-less).
- `src/expr/evaluate.ts`: `EvalScope{locals?,state?,props?,computed?}`; computed
  values resolve a bare name (`displayName`) to a `getDisplayName` thunk result.
- `src/behavior/scan.ts`: name-only export scan → `BehaviorApi` with `hasSetup`,
  `events`, `computed`, `lifecycle`, `other`, `all`.
- `src/errors.ts`: `adxError(file,line,msg)` and `adxFileError(file,msg)` enforce
  the exact format; tests assert verbatim.

---

## Phase 1 — Real data binding (`--data` + sandboxed `setup()`)

### CLI surface

`src/cli.ts` `parseArgs` gains `--data <file.json>` (same pattern as `--tokens`:
read the next argv, store on `ParsedArgs.data`). `adx build <dir> --data d.json`
and `adx check <dir> --data d.json` both accept it. When omitted, behavior is
backward-compatible: props come from manifest defaults only (M1 behavior), except
that required-prop validation (below) now runs.

`--data` points at a JSON file whose top-level object is the **props object** for
a single-component build. Example `{ "name": "Ada Lovelace", "role": "Engineer" }`.

### Pipeline change in `compile.ts`

`CompileOptions` gains `data?: Record<string, unknown>` (the parsed JSON, passed
by the CLI; keeping `compileComponent` pure of file I/O for `--data` mirrors how
`tokensPath` is handled — the CLI reads the file, the pipeline takes the object).
`compileComponent` builds the effective props as a three-layer merge:

1. manifest defaults (from `defaultProps(manifest)`),
2. overlaid by supplied `data` (shallow merge; `data` wins per key),
3. then **required-prop validation** runs against the merged object.

The merged props object is passed to the sandbox to run `setup(props)`. The
returned value becomes `state`; the scope becomes `{ state: setup(props), props,
computed }`, replacing M1's `{ state: props, props }`. `computed` is populated
from `get*` exports (see "Computed values + the `get*`→bare-key lowering" below).

### Computed values + the `get*`→bare-key lowering (NIT-4, new Phase 1 work)

`EvalScope.computed` keys values by their **bare computed name** (verified in
`evaluate.ts`: a bare ident `displayName` resolves against `scope.computed`).
Today **no such lowering exists in M1 code**: `compile.ts` sets `scope = { state,
props }` with **no** `computed` key, and `scan.ts` stores raw export names
(`getDisplayName`). The `getXxx → bare name` mapping is specified only in
`docs/adx-grammar.md` (§4.3), not implemented anywhere in `src/`. **Phase 1
introduces this lowering** to populate the build-time `scope.computed` map;
**Phase 4 reuses the same helper** to derive its `computedKeys` freeze set — the
two phases MUST agree byte-for-byte, so the helper is defined once and exported.

Exact lowering (pin, byte-for-byte):

```ts
// bareComputedKey("getDisplayName") === "displayName"
// bareComputedKey("getURL")         === "uRL"   (acronym case, see note)
// bareComputedKey("getX")           === "x"
export function bareComputedKey(exportName: string): string {
  const tail = exportName.slice(3);           // strip the leading "get"
  return tail.charAt(0).toLowerCase() + tail.slice(1); // lowercase ONLY char 0
}
```

Rule in words: strip the leading `get` (exactly three chars — the scanner only
classifies `get[A-Z]…`, so `get` is always present), then lowercase **only the
first remaining character**, leaving every subsequent character untouched.
**Acronym case decided:** `getURL → uRL` (only the first char is lowercased; the
rest of an all-caps acronym is preserved verbatim). This is a deliberate, pinned
choice — not a camelCase smart-split — so Phase 1's `scope.computed` keys and
Phase 4's `computedKeys` are identical for every input including acronyms, and it
matches `evaluate.ts`'s single-char resolution contract. The grammar doc §4.3 is
updated to state this exact rule (including the `getURL → uRL` example) so the
spec and code agree.

Phase 1 builds `scope.computed` as `{ [bareComputedKey(name)]: thunk }` for each
scanned `get*` name (thunks per the sandbox step 5 above); Phase 4 builds
`computedKeys = new Set(behavior.computed.map(bareComputedKey))`. One helper,
two call sites.

### Required-prop validation (kills the empty-`<h2>` bug)

Before rendering, for every manifest prop with `required: true`: if the merged
props object has no own value for it (neither a manifest `default` nor a supplied
value), throw a line-less manifest error. The hint is **branched by the caller**
(NIT-3), because a prop can be supplied three different ways and "via --data" is
only true for the standalone path:

```
# standalone single-component build (value would come from --data):
[ADX] manifest.json - Missing required prop "name" (no default and none supplied via --data)
# page instance (value would come from the page manifest's data):
[ADX] manifest.json - Missing required prop "name" (no default and no value in the page's component data)
# composed child (value would come from the parent's :prop bindings):
[ADX] manifest.json - Missing required prop "name" (no default and no value passed by the parent)
```

`resolveProps(manifest, data, source)` takes a `source: "standalone" | "page" |
"composed"` discriminator and selects the matching parenthetical; the leading
`Missing required prop "<name>" (no default and ...` stem is identical across all
three, so tests can assert the stem and the branch independently. Rationale for
`manifest.json` as the file: the contract that declares the prop required lives
there regardless of who was supposed to supply the value, and the message is
line-less per the manifest error rule.
This runs in `compile.ts` (the `resolveProps(manifest, data, source)` helper
above) so both `build` and `check` enforce it. `check` with no `--data` on a component that has
a required prop with no default will now fail — this is intended (it surfaces the
SEO-breaking empty element at check time). Documented as a behavior change.

**`check` for pages and composed-only children (MEDIUM-6).** `adx check
<page.json>` runs the **same** required-prop validation for **every** component
instance, against that instance's merged props (manifest defaults ⊕ the page
manifest's per-instance `data`), failing per instance on the first missing
required prop — so a page is only "checkable" when every instance is fully
supplied. A component that is only ever used *composed* (its required props come
from a parent, not from standalone `data`) will **fail** a standalone `adx check
<childDir>` run without `--data`; this is the documented, intended consequence of
Phase 1 (Risk 6), not a bug. Guidance (in agent-reference + human-guide): check a
composed-only child via a page that uses it, or by passing a sample `--data` that
supplies its required props.

Validation is value-presence only in M2 (required = present). Type-checking the
supplied value against `PropDef.type` is **out of scope** for M2 (listed in Out
of Scope) to keep the phase focused; noted as a candidate for a later milestone.

### Build-time ↔ runtime state contract (HIGH-1 resolved)

The review flagged that the design never said which `state` Phase 4 patches from.
This is the explicit contract:

- **Build time:** the compiler runs `setup(mergedProps)` in the sandbox and bakes
  the resolved values into the static HTML (zero `{{` left). `mergedProps` =
  manifest defaults ⊕ `--data`/page-instance `data` (shallow, data wins).
- **Runtime (browser):** the M1 glue already calls `const state = setup(props)`
  at load (verified in `src/codegen/glue.ts`), importing `setup` from
  `./behavior.js`. **This browser-side `setup(props)` result stays the single
  runtime source of truth** for Phase 4 patching — the compiler does NOT serialize
  the sandbox state object into the glue.
- **The invariant that makes hydration safe:** the `props` passed to the browser
  `setup` MUST equal the `mergedProps` the HTML was built from. If they differ
  (e.g. the glue runs `setup` with only manifest defaults while the HTML was built
  with `--data`), the first binding patch could overwrite correct crawled content
  with different values — a silent SEO/hydration mismatch.

**Required glue change (verified gap in M1).** Today `emitGlue` bakes only
`buildProps(ctx)` — manifest defaults — into `propsJson`, with a
`globalThis.__ADX_PROPS__[Component]` override (NIT-1: the emitted glue reads
`globalThis.__ADX_PROPS__`, not `window`; the design and the jsdom/Node test
harness use `globalThis.__ADX_PROPS__` consistently). That is NOT the merged
props when `--data`/page `data` is supplied, so M1's glue would re-run `setup`
with the wrong props. M2 changes `emitGlue` to bake the **merged props** (the same
`mergedProps` object the sandbox used) into `propsJson`. The
`globalThis.__ADX_PROPS__` override
remains for host-driven re-hydration but defaults to the merged props. The
`CodegenContext` is extended to carry `mergedProps` so `emitGlue` reads them
instead of recomputing defaults.

Consequence: browser `setup(mergedProps)` reproduces exactly the state the HTML
was built from, so first paint and the pre-event DOM are identical to the crawled
HTML; Phase 4's first patch is a no-op against unchanged state. If `setup` is
non-deterministic (e.g. reads `Date.now()`), build-time and first-paint values can
still differ — this is a documented property of putting non-determinism in
`setup`, called out under Phase 4 limits, not a compiler guarantee to defeat.

**Test (required).** An integration test compiles a component with `--data`,
renders the emitted HTML into a DOM, runs the glue module, and asserts the DOM
text/attributes are **unchanged** after hydration and before any event is
dispatched (pre-JS HTML == post-hydration DOM).

### Sandbox construction (the core new mechanism)

New module `src/behavior/run.ts` exporting
`runSetup(behaviorSrc, props, opts): { state, computed }`.

**Mechanism.** Node `node:vm`:

1. Build a frozen context object with an explicit, minimal global surface and
   nothing else:
   - Provided: `Object`, `Array`, `String`, `Number`, `Boolean`, `Math`, `JSON`,
     `Date`, `RegExp`, `Map`, `Set`, `Symbol`, `Infinity`, `NaN`, `undefined`,
     plus `console` mapped to a no-op (every method is a function that returns
     `undefined` and records nothing, so stray `console.log` in `setup` neither
     crashes nor leaks to the build output), and a no-op `emit` stub (NIT-3: the
     stub is `function emit() { return undefined; }` — it silently discards its
     arguments, records nothing at build time, and returns `undefined`, so a
     `get*` or `setup` that references the free `emit` neither throws nor affects
     the build; emits only matter at runtime in the browser glue, Phase 4).
   - **Absent** (the security contract): `require`, `module`, `exports`,
     `process`, `global`/`globalThis` (not forwarded), `Buffer`,
     `setTimeout`/`setInterval`/`setImmediate`, `fetch`, `import`/dynamic import,
     `eval`'s access to the host, and any `node:` builtin. Because the vm context
     is created fresh via `vm.createContext({...only the above...})`, these names
     simply do not resolve inside the sandbox → `ReferenceError`.
   - **Only `setup` and (lazily) `get*` are INVOKED in the sandbox (MEDIUM-2).**
     After the `export`-strip, the entire module body is evaluated by
     `runInContext`, so every de-`export`ed declaration — including handlers like
     `onClick`/`onFollowClick` that reference a free `emit` or `document`/`event`
     — is **declared**. But declaring a function that references free `emit`/
     `document` does not *call* it, so no `ReferenceError` fires at module-eval
     time; those free references are inert at build time. The build invokes only
     `setup(__ADX_PROPS__)` and, lazily, each referenced `get*(__ADX_STATE__)`.
     Handler bodies are never run during compilation — a reader should not fear
     that a handler touching the DOM throws at build time (it is only declared).
   - **Freeze semantics (MEDIUM-2).** The context *seed* object (the map of
     provided globals above) is `Object.freeze`d before `vm.createContext`, so the
     intended global surface is non-reconfigurable and user code cannot, e.g.,
     reassign `JSON`/`Math` on the seed to tamper with later reads. This is
     defense-in-depth, **not** a security boundary (Risk 1): `vm` is not a hard
     sandbox, and in any case in-sandbox reassignment of a free name (e.g.
     `emit = () => {}` inside the module body) is **harmless** — it only mutates
     the sandbox realm, which is discarded immediately after the build. We do not
     attempt to prevent such reassignment; we rely on the realm being throwaway.
2. Transform the ES-module `behavior.adx.js` source into something runnable in a
   `vm` script. `vm` runs scripts, not ES modules, so the module's `export`ed
   declarations are rewritten to plain declarations and the ones we need are
   collected. This avoids a full JS parser/bundler and matches M1's "name-scan,
   no deep parse" philosophy.

   **Exact strip (MEDIUM-1).** Reuse the scanner's `EXPORT_RE`
   (`/\bexport\s+(?:async\s+)?(?:function\s*\*?|const|let|var)\s+<name>/g`) to
   locate each top-level export, and for every match **remove only the leading
   `export ` keyword token**, preserving the rest of the declaration verbatim.
   This is a keyword strip, not a "replace `export function` with `function`"
   rewrite, so every scanned spelling survives intact: `export function setup`,
   `export async function setup`, `export function* gen`, and crucially
   `export const setup = (p) => ({…})` / `export let` / `export var` all become
   their non-exported declaration form. (`export const setup = …` is a valid
   scanned form because `EXPORT_RE` matches `const|let|var`; after the strip it is
   `const setup = …`, a normal declaration the appended invocation can call.)
   Implementation detail: strip by walking the `EXPORT_RE` matches and splicing
   out the matched `export ` span of each, left-to-right, so handler/lifecycle/
   `other` declarations are also de-`export`ed and simply become inert local
   declarations (they are declared, never invoked — see MEDIUM-2).

   **Exact return/invocation list (MEDIUM-1).** The names we invoke come from the
   scanner's classification, NOT from "every export": only `setup` (and only when
   `hasSetup` is true) plus the `computed` names (`get*`). Order of operations:
   (a) scan → `BehaviorApi`; (b) if `!hasSetup`, fail fatally with the "Missing
   required export \"setup\"" error **before** building any invocation (so the
   invocation expression never references a non-existent `setup`); (c) only then
   append the trailing statements. The appended tail is:
   `;globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__);` for state, and
   the `get*` thunks are invoked lazily (step 5) each via a per-`get*`
   `vm.Script` of `globalThis.__ADX_COMPUTED__ = <getName>(globalThis.__ADX_STATE__);`.
   The sandbox never references `events`/`lifecycle`/`other` names — they are left
   as inert de-`export`ed declarations. `computed` names are listed in the
   scanner's deterministic (sorted) order so the build is reproducible.
   Dynamic/`import`-using behavior files will fail in the sandbox — documented as
   unsupported. The appended `setup` tail and each per-`get*` script read/write
   through `globalThis.__ADX_PROPS__` / `globalThis.__ADX_STATE__` /
   `globalThis.__ADX_COMPUTED__` consistently (NIT-1), matching the runtime
   glue's `globalThis.__ADX_PROPS__` naming so the build-time and runtime
   contracts use the same global name.

   Unit tests (MEDIUM-1): assert both `export function setup(p) { return {…} }`
   and `export const setup = (p) => ({…})` strip-and-run to the same state; assert
   `getDisplayName` is collected as `displayName` and an unused `get*` is never
   invoked; assert a file with no `setup` fails with the exact "Missing required
   export" error before any invocation is appended.
3. Compile once: `new vm.Script(wrapped, { filename: "behavior.adx.js" })`.
4. Run with a timeout: `script.runInContext(ctx, { timeout: opts.timeoutMs ??
   1000 })`. Because the stripped-and-appended source assigns
   `globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__)` (step 2), this one
   timed run both evaluates the module and produces `state`, read back as
   `ctx.__ADX_STATE__`. Nothing is returned to the host realm as a callable
   `fns.*` map — `get*` values are produced later by their own timed
   `runInContext` (step 5).
5. Obtain `state` and build the lazy `computed` map. **The timeout mechanism is
   `runInContext`-only; there is NO host-side `fns.getX(state)` call (MEDIUM-1).**
   The state is produced by appending `;globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__);`
   to the stripped module source (see "Timeout enforcement") and reading
   `ctx.__ADX_STATE__` back after the single timed `runInContext`. `computed` is
   a map of bare name → **thunk**, where each thunk is itself a tiny timed
   `runInContext` of a per-`get*` compiled `vm.Script`:

   ```ts
   // one pre-compiled Script per get* name, writing a per-get* result slot:
   const script_displayName = new vm.Script(
     "globalThis.__ADX_COMPUTED__ = getDisplayName(globalThis.__ADX_STATE__);",
     { filename: "behavior.adx.js" },
   );
   // the thunk EvalScope.computed stores (lazy, matches the thunk contract):
   computed.displayName = () => {
     script_displayName.runInContext(ctx, { timeout: opts.timeoutMs ?? 1000 });
     return ctx.__ADX_COMPUTED__;
   };
   ```

   This matches `EvalScope.computed`'s thunk contract: a `get*` that is never
   referenced is never run, and one that throws only fails if actually used. Both
   `setup` and every `get*` therefore execute **in-context under the timeout** —
   the design never calls a host-realm `fns.getDisplayName(state)`. Because every
   `get*` reads the same `globalThis.__ADX_STATE__` the emitter was handed (one
   reference, no clone), a `get*` can never observe a different state object than
   a direct binding (HIGH-2). Re-entrancy note: reads are lazy and single
   (`evaluate` resolves one computed value, immediately consumes `ctx.__ADX_COMPUTED__`,
   before the next thunk runs), so the shared `__ADX_COMPUTED__` slot is never
   clobbered by an overlapping read.

**Timeout enforcement (single mechanism — MEDIUM-1).** `vm`'s `timeout` option
aborts a synchronous script that runs longer than the budget by throwing, and it
applies to each `runInContext`. **Every piece of user code runs through a timed
`runInContext`** — there is no host-side invocation path that escapes the budget:

- **Module eval + `setup`:** one script. The stripped module source has
  `;globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__);` appended, and
  `globalThis.__ADX_PROPS__` is injected into the context before running. The one
  `runInContext(ctx, {timeout})` call covers both module evaluation and the
  `setup()` invocation, so an infinite loop inside `setup` is caught by the same
  timeout.
- **Each `get*`:** its own pre-compiled `vm.Script` (step 5) run by a second
  `runInContext(ctx, {timeout})` reusing the already-built context, writing
  `globalThis.__ADX_COMPUTED__` and read back immediately.

Because `__ADX_STATE__` is the exact object `setup` returned and the same
reference handed to the emitter (no clone — HIGH-2), the `get*` script and a
direct binding always evaluate against one identical state. This keeps every
piece of user code under a timeout while preserving the single-state-object
guarantee. (The earlier draft's host-side `() => fns.getDisplayName(state)` form
is removed; it would have escaped the timeout and is explicitly not used.)

**Return→state (HIGH-2 resolved: one state object for both the emitter and
`get*`).** `setup`'s return value is captured as `globalThis.__ADX_STATE__`
inside the context and read back via `ctx.__ADX_STATE__`. The context is created with
`vm.createContext`, so it shares the host realm's intrinsics and returned
objects are usable directly on the host side. **Decision: do NOT JSON-clone the
state.** `runSetup` returns the exact in-context object as `state`, and the same
reference is both (a) handed to the HTML emitter as `scope.state` and (b) the
argument every `get*` thunk is invoked with (`getX(state)` — see "Computed
values"). This closes the divergence the review flagged: an earlier draft handed
the emitter a JSON-safe clone while running `get*` thunks against the live
in-context state, so for a `Date`/`Map`/function/getter the two paths produced
different output. With a single shared object, a direct binding of `state.foo`
and a `get*` that reads `state.foo` always see identical values.

Rationale for dropping the clone: the emitter only ever *reads* values
(`evaluate`'s ident/member walk, `toText`), it never mutates `state`, so there is
no isolation benefit to a copy — and the copy actively broke correctness for
non-JSON values. The sandbox context is discarded immediately after the build, so
there is no lifetime concern from holding its references briefly during emission.

Non-JSON values the HTML needs: a `Date`/`Map`/custom object reaches the emitter
intact and is rendered via `toText`→`String(value)` (M1 behavior, verified in
`evaluate.ts`), so `new Date(...)` renders its string form consistently whether
read directly or via a `get*`. Values that cannot render to text meaningfully
(functions, symbols) still resolve to `undefined`/empty exactly as a missing
binding does — no special-casing, no error.

Edge: `setup` returning a non-object (e.g. `undefined`) → treat as `{}` and let
required bindings resolve to empty; this cannot happen for a well-formed
component. `adx check` MAY warn in a later milestone.

### Error handling (Phase 1)

| Failure | Recoverable? | Caller receives | Logged |
|---|---|---|---|
| `--data` file missing/unreadable | fatal | `[ADX] <data-file> - Cannot read data file` (CLI-level, file is the given path) | CLI writes to stderr, exit 1 |
| `--data` not valid JSON | fatal | `[ADX] <data-file> - Invalid JSON` | stderr, exit 1 |
| `--data` top-level not an object | fatal | `[ADX] <data-file> - Data must be a JSON object of props` | stderr, exit 1 |
| required prop missing | fatal | `[ADX] manifest.json - Missing required prop "x" (<branch hint — "none supplied via --data" / "no value in the page's component data" / "no value passed by the parent">)` | stderr, exit 1 |
| sandbox: `setup` touches `require`/`fs`/`process`/etc. | fatal | `[ADX] behavior.adx.js - setup() failed: <ReferenceError message>` | stderr, exit 1 |
| sandbox: timeout exceeded | fatal | `[ADX] behavior.adx.js - setup() exceeded time budget (1000ms)` | stderr, exit 1 |
| sandbox: `setup` throws | fatal | `[ADX] behavior.adx.js - setup() failed: <message>` | stderr, exit 1 |
| behavior has no `setup` export | fatal | `[ADX] behavior.adx.js - Missing required export "setup"` | stderr, exit 1 |

All thrown as `AdxError` (via `adxError`/`adxFileError`) so the format is uniform
and tests assert verbatim. `behavior.adx.js` errors are line-less in M2 (the
scanner is name-only and does not track a line for the failing statement; adding
real line numbers to sandbox failures is a later refinement — noted). The grammar
doc's `[ADX] <file>:<line>` shape permits line-less file errors (manifest
precedent), so this is consistent.

**Security note to document** (agent-reference + human-guide + architecture):
compiling a component runs its `setup()` on the build machine inside a hardened
sandbox (no `require`/`fs`/`network`/`process`, timed). Normal logic works;
dangerous calls fail because those globals are absent. Compiling an untrusted
third-party component still carries the same caution as running any untrusted
build tool — the sandbox narrows but does not eliminate that trust (see Risks).

### Testability (Phase 1)

Unit: `runSetup` with a benign `setup` returns expected state; with
`require('fs')` throws the ReferenceError-mapped `[ADX]` error; with
`while(true){}` hits the timeout; `||` defaults and `get*` computed values
resolve. `resolveProps` merge + required validation table-driven. Integration:
`compileComponent` on the fixture with/without `--data` produces non-empty
`<h2>`; a required-prop-without-default component fails `check`.

---

## Phase 2 — Pages (JSON page manifest → crawlable `index.html` per page)

### Exact page-manifest shape (DECIDED)

A page is a JSON file. Shape (spec'd here, documented in grammar + agent-ref):

```json
{
  "page": "about",
  "title": "About us",
  "description": "Who we are and what ADX is.",
  "lang": "en",
  "canonical": "/about/",
  "schema": "AboutPage",
  "components": [
    {
      "use": "./components/site-header",
      "data": { "current": "about" }
    },
    {
      "use": "./components/user-card",
      "data": { "name": "Ada Lovelace", "role": "Founder" }
    }
  ]
}
```

Field rules (validated by a new `src/page/load.ts`, errors use
`[ADX] <page-file> - <message>`, line-less — a page manifest is JSON like
`manifest.json`):

- `page` (required, string): the URL slug. Must match `^[a-z0-9]+(?:-[a-z0-9]+)*$`
  (lowercase, hyphenated, crawlable). `page: "index"` or `page: "home"` maps to
  the site root `/index.html`; any other `page: "about"` maps to
  `<out>/about/index.html` (clean URL `/about/`). This is the only field that
  decides the output path.
- `title` (required, string): the `<title>` and OG/Twitter title. Required
  because the SEO contract mandates a title per page.
- `description` (required, string): meta description + OG/Twitter description.
  Required for the same reason.
- `lang` (optional, string, default `"en"`): the `<html lang>`.
- `canonical` (optional, string, default derived from `page`: `/` for root else
  `/<page>/`): the canonical URL.
- `schema` (optional, string): schema.org `@type` for a JSON-LD block.
- `components` (required, non-empty array): ordered list of component instances.
  Each entry: `use` (required string) and `data` (optional object, the props for
  that instance — same shape as a `--data` file). Order is the DOM order within
  `<main>`.
  - `use` (NIT-4) must point at a **component directory** (one containing the four
    `.adx` files), resolved relative to the page-manifest's own directory. It is
    **never** another page manifest — nesting pages is out of scope for M2. A
    `use` that resolves to a `.json` file or a directory lacking `manifest.json`
    is the "Component not found" fatal error below. (This also keeps the Phase 2
    dispatch unambiguous: pages are only ever the top-level positional arg.)

Rationale for this shape: it is a flat JSON object (token-cheap, trivial for an
agent to emit), it is consistent with the API-driven pillar, and it carries
exactly the SEO metadata the document wrapper needs — nothing more. It reuses the
component `data` concept from Phase 1 verbatim, so an agent learns one data shape.

### Pipeline: `compilePage`

New `src/page/compile.ts` `compilePage(pageManifestPath, opts): CompiledPage`.
It loads+validates the page manifest, then for each `components[i]`:

1. resolves `use` to an absolute dir,
2. calls the existing single-component path to produce that instance's HTML body,
   CSS, and glue, passing `data` as the instance props (reusing Phase 1's
   `resolveProps(childManifest, data, "page")` + sandbox — the `"page"` source
   selects the page-manifest branch of the required-prop hint),
3. concatenates the component bodies in order inside one `<main>`,
4. unions each component's scoped CSS into one `style.css` (scope ids keep them
   isolated — see Phase 3), and
5. emits one glue module per **distinct component** — each carrying an
   `INSTANCES` array with one record per instance of that component on the page
   (each record's own `instanceIndex` + its own merged props), so the single
   module hydrates all N instances per-instance (see "Per-instance identity …" in
   Phase 3) — plus a tiny page entry that imports each component's module.

The page document is built by a page-aware variant of `wrapDocument`
(`wrapPageDocument`) that takes the page manifest's SEO fields directly rather
than a single component's `manifest.seo`. It emits the page's `lang` on `<html>`
and the correct per-page `canonical` (derived from the slug), which M1's
`wrapDocument` cannot.

**Page JSON-LD body (NIT-3).** M1's `wrapDocument` emits JSON-LD as
`{ "@context": "https://schema.org", "@type": seo.schema, name: manifest.name }`
(verified in `compile.ts`). A page has no `manifest.name`, so `wrapPageDocument`
emits, **only when `page.schema` is present**:

```json
{ "@context": "https://schema.org", "@type": "<page.schema>", "name": "<page.title>" }
```

i.e. the page's `schema` is the `@type` and the page's `title` is the `name`; no
block is emitted when `schema` is absent (matching M1's "schema-gated" behavior).
The SEO integration test asserts the page's JSON-LD `@type` equals `page.schema`
and `name` equals `page.title` (not a component name).

**Single-component SEO stays M1-fixed (NIT-2).** `adx build <dir>` still uses the
M1 `wrapDocument`, which hardcodes `<html lang="en">` and `<link rel="canonical"
href="/">` (verified). That means a standalone single-component build emits a
root canonical even if the component is not at site root. This is a conscious
deferral, not an oversight: **real per-page SEO (correct `lang`/`canonical`/OG
per URL) comes from the page manifest** in M2. Proper single-component SEO
overrides (e.g. a `canonical`/`lang` field on `SeoMeta`, which today has neither)
are listed in Out of Scope as a later refinement. One `<h1>` rule: the page is
responsible for heading order across components; M2 does not auto-insert an
`<h1>` — documented as an authoring responsibility (a page whose components emit
zero or multiple `<h1>`s is the author's concern; `adx check` MAY warn in a later
milestone). This keeps the compiler from rewriting user headings.

### Output layout

```
<out>/
  index.html            # page "index"/"home"
  about/index.html      # page "about"
  <page>/style.css      # per-page merged, scoped CSS
  <page>/glue.js        # per-page entry importing each component's hydration
  <page>/<comp>.behavior.js   # each used component's behavior (for its glue import)
```

Decision: assets live beside each page (`about/style.css`, `about/glue.js`) and
the page's `<link>`/`<script>` use relative paths, so a page at `/about/` loads
`/about/style.css`. This keeps each page self-contained and avoids a shared asset
cache-busting problem in M2 (a shared `/assets/` dir with content hashing is a
later optimization — noted). Root page assets sit at `<out>/style.css` etc.

### Backward compatibility

`adx build <dir>` (a directory containing the four component files, detected by
the presence of `manifest.json` + `structure.adx`) keeps the M1 single-component
output exactly. `adx build <file.json>` (a path ending in `.json`) is treated as a
page build. The dispatch is a single strict rule with no overlap (NIT-2):

1. positional arg ends in `.json` → **page build** (load it as a page manifest);
2. else the arg is a directory containing `manifest.json` → **component build**;
3. else → fatal `[ADX] <path> - Not a component directory or page manifest`.

There is deliberately **no** "a directory containing a `page.json` is a page
build" alternative — a page is only ever named directly as the top-level `.json`
positional arg, so a directory that happens to hold both `manifest.json` and some
`page.json` is unambiguously a component build (rule 2), and a page is unambiguously
rule 1. This keeps the error table and the Phase 2 `use`-resolution rule (pages are
never referenced as directories) mutually consistent.

### Error handling (Phase 2)

| Failure | Recoverable? | Caller receives | Logged |
|---|---|---|---|
| page file missing/unreadable | fatal | `[ADX] <page-file> - Cannot read page manifest` | stderr, exit 1 |
| page not valid JSON | fatal | `[ADX] <page-file> - Invalid JSON` | stderr, exit 1 |
| missing `page`/`title`/`description`/`components` | fatal | `[ADX] <page-file> - Missing required field "<f>"` | stderr, exit 1 |
| `page` slug invalid | fatal | `[ADX] <page-file> - Invalid page slug "<v>" (lowercase, hyphenated)` | stderr, exit 1 |
| `components` empty | fatal | `[ADX] <page-file> - "components" must list at least one component` | stderr, exit 1 |
| a `use` path missing | fatal | `[ADX] <page-file> - Component not found: "<use>"` | stderr, exit 1 |
| a component fails to compile | fatal | the component's own `[ADX] <file>:<line> - …` (propagated unchanged) | stderr, exit 1 |

### Testability (Phase 2)

Unit: `loadPage` validation table. Integration: a two-page fixture site compiles
to `index.html` and `about/index.html`; raw HTML (pre-JS) contains the resolved
content and the page's title/description/canonical; zero `{{` remain. `adx check
<page.json>` passes when every instance's required props are supplied and fails
with the child's `[ADX] manifest.json - Missing required prop …` when one is not
(MEDIUM-6).

---

## Phase 3 — Component composition (custom tags, slot projection, prop passing, CSS isolation)

### Tag resolution against `manifest.deps`

Today `manifest.deps` is `string[]`. For composition the compiler must map a
custom tag in `structure.adx` (e.g. `<user-card>`) to a dependency directory.
Decision: a dep path's **component name** (its `manifest.name`, kebab-cased)
and/or its **directory basename** both resolve the tag. Concretely, when the HTML
emitter encounters an element whose `tag` is not a known HTML element and is not a
`slot`, it looks the tag up in a **dep resolution table** built once per
component: for each entry in `deps`, load that dep's `manifest.json`, and index it
by (a) the kebab-case of `manifest.name` and (b) the dep directory basename. A
tag matching either key resolves to that dep. "Known HTML element" is decided by a
curated allowlist set (`src/codegen/html-tags.ts`) of standard HTML tag names;
anything not in it and not resolved via deps is an error (below). This is explicit
(no magic filename convention) and matches the architecture's "trace deps by
reading files" pillar.

`manifest.deps` entries in M1 are relative paths (e.g. `"./button"`); the loader
already validates them as strings. Composition resolves them relative to the
*using component's* directory.

### Recursive compilation + prop passing

When the emitter resolves `<user-card :name="author.name" role="Founder">` to a
dep:

1. Evaluate the custom element's `:prop` bindings and plain attrs **against the
   parent's current scope** (reusing `evaluate`/`resolveBinding`) to produce a
   concrete child props object. `:name="author.name"` → the parent's resolved
   value; `role="Founder"` (plain attr) → the literal string. `@event` on a
   custom tag is recorded for the parent's glue (parent listens for the child's
   emitted events — the child root dispatches bubbling CustomEvents already).
2. Compile the child component **recursively** with those props: load child
   manifest, run Phase 1 `resolveProps(childManifest, childProps, "composed")` +
   sandbox `setup(childProps)` (the `"composed"` source selects the parent-passed
   branch of the required-prop hint), parse child
   structure, and emit the child's HTML body with the child's own `scopeId`.
   This is a new internal `emitComponentInstance(dir, props, projected, state)`
   that `emitHtml` calls when it hits a resolved custom tag. The child's body is
   spliced in place of the custom tag.
3. The child's scoped CSS and glue are registered with the top-level build so the
   page/component output includes them exactly once per distinct component
   (dedupe by resolved **absolute** dir).

**Child `scopeId` location (MEDIUM-3).** M1 computes `scopeId(name, basename(dir))`
in `compile.ts`. Using `basename(dir)` for a recursively compiled child is unsafe:
two deps with the same directory basename in different folders (e.g.
`a/button` and `b/button`) would hash to the same scope id and their CSS would
cross-talk — the exact isolation this phase promises. Decision: during recursive
compilation, pass the **resolved absolute dir** (or a stable repo-relative path)
as `scopeId`'s `locationPath`, matching the "dedupe by resolved absolute dir"
rule used for CSS/glue. `scope.ts` already documents that the caller chooses the
location string as long as it is stable; the single-component M1 path keeps
`basename(dir)` for backward-compatible ids (its existing fixtures/tests assume
that), while the composition/page paths use a repo-relative path.

**Normalization is CALLER work, not `scope.ts` (NIT-2).** Verified:
`scopeId(name, locationPath)` in `src/codegen/scope.ts` hashes
`name\u0000locationPath` **verbatim** — it performs no normalization and will
not. So the reproducibility guarantee depends on the **caller** passing a stable,
machine-independent string. Decision: the caller (`compile.ts` for the
single-component path's composed children, and `compilePage` for pages) computes
`relative(repoRoot, absDir)` with `node:path`'s `relative`, converts path
separators to `/` (so Windows and POSIX agree), and passes **that** as
`locationPath`. An absolute prefix like a user's home dir therefore never enters
the hash, so the id is identical across checkouts/machines.

**`repoRoot` determination (pin):** `repoRoot` is resolved once per build as the
nearest ancestor directory — walking up from the build input (the component dir
for `adx build <dir>`, or the page manifest's directory for `adx build
<page.json>`) — that contains a `package.json`; if none is found before the
filesystem root, `repoRoot` falls back to the build input's own directory. This
is deterministic, needs no git, and matches the single-package-at-repo-root
layout (steering: the repo *is* the `adx` package, rooted at `package.json`).

Because each component keeps its **own deterministic `scopeId`**, and
`transformCss` scopes every selector by that id, child and parent CSS never
collide — isolation is inherited from M1. The child's `data-adx-c` is the child's
id; the parent's is the parent's id.

**One component used N times (MEDIUM-3/MEDIUM-4).** The same component used
multiple times on a page shares one `scopeId`, so its scoped CSS block is emitted
**once** (deduped by resolved absolute dir) and its body is emitted **N times**,
all carrying the shared `data-adx-c`. That is correct for CSS (one rule set
matches all instances). But hydration is **per-instance**: each instance body
additionally carries a per-instance root discriminator `data-adx-i="i<ordinal>"`,
its hook ids are instance-scoped, and the glue loops over an array of instance
records with one `setup`/`state`/`emit`/`rerender` per instance — see
"Per-instance identity: hook ids, instance roots, and the glue module" below,
which is the authoritative spec for repeated instances.

### Per-instance identity: hook ids, instance roots, and the glue module (HIGH-1, HIGH-2, MEDIUM-4)

This is the crux subsystem. The hard constraint is **per-instance** hydration:
one component used N times on a page produces N independent runtime instances,
each with its own `props`, its own `setup(props)` → `state`, its own root
subtree, and its own event/`emit`/patch routing. The three mechanisms below
(unique hook ids, a per-instance root discriminator, and an instance-looping glue
module) are what make that real; none of them may collapse back to a single
shared root or state.

#### 1. Unique hook ids per instance (MEDIUM-4)

M1's `bindingId(scope, index)` = `${scope}-${index}`, and `bindingCount` resets to
`0` on every `emitHtml` call (verified in `html.ts`). If `compilePage` (or a
parent composing the same child twice) calls the emitter once per instance, two
instances of the **same** component (same scope id) both emit
`data-adx-b="cXXXXXXX-0"`, `-1`, … → **duplicate ids on one page**. A selector
keyed on scope alone would then bind only the first match, so the second instance
is dead.

Decision: thread a **page-global instance ordinal** into the hook id so every
instance's hooks are unique. `EmitState.bindingCount` is augmented by a shared
instance-ordinal counter owned by the top-level build (`compilePage` / the
single-component entry), and the id becomes `${scope}-i${instanceIndex}-${n}`
where `instanceIndex` is a monotonically increasing per-instance ordinal assigned
when an instance is emitted (the first instance encountered is `i0`, the next
`i1`, …), and `n` is the per-instance node counter (reset to 0 at the start of
each instance). `scope.ts` gains an additive sibling
`instanceBindingId(scope, instanceIndex, n): string` returning
`` `${scope}-i${instanceIndex}-${n}` ``. The original `bindingId` is kept
unchanged for any caller that still wants the two-part form, but the emit path
switches to `instanceBindingId`; this is an **additive signature change** to
`scope.ts`, reflected in the files-map below. The scope id still groups CSS; the
`i<ordinal>` segment disambiguates repeated instances; `n` disambiguates nodes
within an instance.

For the single-component M1 build there is exactly one instance (`i0`), so ids
become `${scope}-i0-${n}` — a stable change (the M1 glue and HTML are regenerated
together, so no external contract breaks; the fixture snapshot tests are updated
once). Alternative considered: keep `${scope}-${n}` and thread a monotonic base
into `bindingCount` across the page; rejected because the explicit `i<ordinal>`
segment makes "which instance" legible in the emitted HTML and in glue selectors,
which matters for debugging a composed page.

#### 2. A per-instance root discriminator (HIGH-1, HIGH-2)

`data-adx-c="<scopeId>"` is **shared** across all N instances of a component (it
is the CSS-isolation key, correctly one per component). It therefore **cannot**
identify an individual instance's root — `querySelector('[data-adx-c=SCOPE]')`
returns only the first instance. The glue needs a per-instance way to locate each
instance's root subtree.

Decision: the HTML emitter stamps a **per-instance root attribute**
`data-adx-i="i<instanceIndex>"` on the component's root element (the top element
of each emitted instance body), **in addition to** the shared
`data-adx-c="<scopeId>"`. So a component used three times emits three roots
carrying `data-adx-c="cXXXX"` plus `data-adx-i="i0"`, `"i1"`, `"i2"`
respectively. The pair `[data-adx-c="cXXXX"][data-adx-i="i<k>"]` uniquely selects
instance `k`'s root; `[data-adx-c="cXXXX"]` still selects the whole set for CSS.
This is an additive `html.ts` change (one more attribute on the instance root),
and it is the single discriminator both the hydration loop (HIGH-1) and `emit`
(HIGH-2) key off, so there is no second ad-hoc mechanism. Rationale for an
explicit attribute over "address the root by its `data-adx-b` id": a root may
have no bindings/events of its own and so carry no `data-adx-b` at all;
`data-adx-i` is always present on every instance root, giving the glue a
guaranteed locator independent of whether the root happens to be hooked.

The emitter identifies "the instance root" as the first/outermost element emitted
for a given instance body. For a component whose structure has a single top-level
element this is unambiguous; for a structure with multiple top-level siblings,
the emitter wraps the instance body is **not** done (no speculative wrappers) —
instead `data-adx-i` is stamped on **each** top-level owned element of the
instance, and the glue's root query returns a NodeList that the instance treats
as its roots (events/patches scope to "the nearest ancestor carrying this
instance's `data-adx-i`", which for multi-root instances is any of them). The
common single-root component (the fixture's `user-card`) has exactly one instance
root. Multi-top-level-element components are documented as supported but
discouraged for composition clarity.

#### 3. The per-instance glue module (HIGH-1, HIGH-2)

The M1 glue (verified in `glue.ts`) is built around **one** `root =
querySelector('[data-adx-c=SCOPE]')` and **one** `state = setup(props)`. That
shape cannot hydrate N instances with N distinct props/state/roots. M2 replaces
it with a module that carries an **array of instance records** and loops,
instantiating each independently.

The compiler bakes, per distinct component, an `INSTANCES` array — one record per
emitted instance of that component on the page — each with its own
`instanceIndex` (the `i<ordinal>`) and its own **merged props** (the exact
`mergedProps` the HTML for that instance was built from; see Phase 1's
build-time↔runtime contract). The emitted module shape:

```js
import { setup, /* handlers */ } from "./behavior.js";

const SCOPE = "cXXXX";

// One record per instance of this component on the page. Each record's props
// are the SAME mergedProps the HTML for that instance was built from, so each
// instance's browser setup() reproduces its own build-time state (no SEO/
// hydration mismatch). Host override: globalThis.__ADX_PROPS__[Component] still
// applies, merged per instance.
const INSTANCES = [
  { i: "i0", props: {/* i0 mergedProps */} },
  { i: "i1", props: {/* i1 mergedProps */} },
  // ...
];

const overrides = (globalThis.__ADX_PROPS__ || {})["Component"] || {};

for (const inst of INSTANCES) {
  // This instance's root: data-adx-c (shared) + data-adx-i (per-instance).
  const root = document.querySelector(
    '[data-adx-c="' + SCOPE + '"][data-adx-i="' + inst.i + '"]',
  );
  if (!root) continue;

  const props = Object.assign({}, inst.props, overrides);
  const state = setup(props); // this instance's OWN state object

  // emit is bound to THIS instance's root (HIGH-2): the CustomEvent is
  // dispatched on the triggering instance's own subtree, so event.target
  // ancestry is correct and a parent listener sees the right instance.
  const emit = (name, detail) =>
    root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true }));

  // Resolve this instance's hooked nodes WITHIN this root only, by the full
  // instance-scoped id (scope + i<ordinal> + n). Scope the lookup to the root
  // subtree so an id is never resolved against a different instance.
  const byHook = (id) =>
    root.matches('[data-adx-b="' + id + '"]')
      ? root
      : root.querySelector('[data-adx-b="' + id + '"]');

  // Per-instance rerender/patch closes over THIS instance's state + root.
  const rerender = () => {
    for (const h of HOOKS /* this component's hooks, see Phase 4 */) {
      const el = byHook(h.id.replace("{i}", inst.i)); // id template per instance
      if (el) for (const u of h.updates) applyUpdate(el, u, state);
    }
  };

  for (const h of HOOKS) {
    const el = byHook(h.id.replace("{i}", inst.i));
    if (!el) continue;
    for (const ev of h.events) {
      // HANDLERS is a build-time map { handlerName: importedFn } the emitter
      // emits once from the imported behavior exports.
      const handler = HANDLERS[ev.handler];
      el.addEventListener(ev.event, (event) => {
        globalThis.emit = emit;   // free-emit resolves to THIS instance (HIGH-2)
        handler(state, event);    // this instance's own state object (HIGH-1)
        rerender();               // patches THIS instance's root only
      });
    }
  }
}
```

Concrete decisions baked in by the code above:

- **One `setup(props)` per instance, one `state` per instance.** The loop body
  declares `const state` inside the `for`, so each instance has its own object.
  No instance ever reads another instance's state (closes HIGH-1).
- **Hook ids are templated per instance.** The compiled `HOOKS` array stores each
  hook's id with the instance ordinal as a `{i}` placeholder (the per-component
  node index `n` is fixed; the `i<ordinal>` varies by instance). `byHook`
  substitutes `inst.i`. Equivalently the emitter can bake a per-instance
  `INSTANCES[k].hooks` array of fully-resolved ids; the design picks the
  **templated** form so the shared `HOOKS` structure (updates + event names) is
  emitted once and only the id's instance segment varies — token-lean and
  unambiguous. Lookups are scoped to `root` (`root.querySelector`, plus a
  `root.matches` check for the root node itself), so an id can only ever resolve
  to a node inside its own instance.
- **`emit` is instance-aware (closes HIGH-2).** Each instance has its own `emit`
  closure capturing that instance's `root`. The free `emit(name, detail)` a
  handler calls is set to the current instance's `emit` immediately before the
  handler runs, so the Nth instance's emit dispatches on the Nth instance's root
  — never the first instance's. The dispatched CustomEvent bubbles with the
  correct `event.target` ancestry, so a parent listening for a child's event
  receives it from the correct instance's subtree.
- **`rerender` is per-instance.** It closes over this instance's `state` and
  resolves hooked nodes only within this instance's `root`, so a patch after a
  handler updates only the triggering instance's DOM (consistent with "instances
  hydrate independently").

Edge case — free `emit` and concurrency: handlers are synchronous DOM event
callbacks, so setting `globalThis.emit = emit` at the top of each handler and
calling the (synchronous) handler before another handler can run is safe (no
interleaving on the single JS thread). An alternative that avoids the shared
`globalThis.emit` entirely is to pass `emit` as a third handler argument
(`handler(state, event, emit)`); rejected for M2 to keep the handler signature
`handler(state, event)` stable with M1's scanned contract, but noted as a
cleaner later option. The per-handler assignment is correct because event
dispatch is synchronous and non-reentrant across instances.

Test (required, HIGH-1): a page using the same component twice with different
`data`; assert both instances' hooked nodes have distinct `data-adx-b` ids, both
roots carry distinct `data-adx-i`, and dispatching an event on each patches **that
instance only** (the other instance's DOM is unchanged).

Test (required, HIGH-2): a page with two instances of a child that `emit`s on
click; click the **second** instance; assert the parent handler receives the
event with `event.target` inside the **second** instance's root (its
`data-adx-i="i1"` subtree), not the first.

### Slot projection into `data-adx-slot` placeholders

The M1 emitter already renders a child's `<slot name>` as
`<slot data-adx-slot="name" data-adx-c="childId"></slot>`. Composition must
replace that placeholder with the parent-provided content.

**Two sides, two forms (MEDIUM-1).** Slots have a declaration side (in the child)
and a projection side (in the parent); M2 specs both:

- **Child declares** a named slot with the unchanged M1 form `<slot actions />`
  (verified in `parser.parseSlot`: the slot name is the first *bare* plain
  attribute). `<slot name="actions" />` is NOT valid and still **errors** today
  (`name="actions"` is a valued attribute → `parseSlot` throws `Slot may only
  carry a name and class shorthands`). The default slot is `<slot />`. No parser
  change; a test asserts `<slot actions />` parses and `<slot name="actions"/>`
  errors.
- **Parent projects** content with `<template slot="actions">…</template>`;
  bare (non-`template`) children project into the default slot.

**Canonical projection syntax: `<template slot="name">` — rationale corrected
(HIGH-3).** The review verified (and I re-confirmed against `src/structure/
tokenizer.ts` + `parser.ts`) that the tokenizer captures the attribute span raw
up to the unquoted `>` and `splitAttributes` reads an attribute name as
"everything up to whitespace or `=`" with **no charset restriction** — so
`<template #actions>` already tokenizes and splits into `{ name: "#actions",
value: null }` with zero tokenizer/parser changes. `PROP_NAME` only guards
`:`-bindings and `@`-events, never plain attributes. The earlier draft's claim
that "`#` is not in the attribute-name charset" and that a "parser change is
required" was **factually wrong** and is removed.

Decision stands on a true rationale: M2 uses `<template slot="name">` as the
canonical projection form because it reads as an ordinary attribute, needs no
special emitter branch (the compose layer just reads `attrs` for a `slot` key),
and keeps one obvious spelling. `#name` is **already parseable today** as a bare
attribute; it is deferred purely for simplicity (one canonical form in M2), not
out of any parser limitation. The grammar/human-guide note `#name` as planned
sugar and explicitly state it is parseable now, so no doc claims a parser
constraint that does not exist. The human-guide's current `#actions` examples are
rewritten to `slot="actions"` with that note.

Content source: children of the custom tag in the parent structure, grouped by
target slot:

- Direct children that are `<template slot="name">…</template>` → projected into
  the child's `<slot name />`.
- A `<template>` with **no** `slot` attribute → projected into the default slot.
- Any **non-`template`** direct child → projected into the default slot.
- Whitespace-only text between templates is ignored for grouping (consistent with
  the parser dropping blank text runs); it is not projected.
- A **self-closing** custom element (`<user-card :name="x" />`) has no children →
  projects nothing; all child slots render empty.

Grouping edge cases (MEDIUM-2):

- **Multiple** `<template slot="actions">` targeting the same named slot is a
  fatal error: `[ADX] structure.adx:<line> - Duplicate slot content for "actions"`
  (line = the second template's line). Default-slot content accumulates in source
  order (a page composing one default slot from several children is normal), but
  a *named* slot takes content from exactly one template.
- A `<template slot="x">` whose target `x` is not a slot the child declares is the
  separate "no slot" fatal error below.

Mechanism: `emitComponentInstance` receives `projected: Map<slotName, Node[]>`
built from the custom element's children (the parser produces a generic
`ElementNode{ tag:"template", attrs:[{name:"slot",value:"actions"}], children }`;
the compose layer reads the `slot` attribute off `attrs`). When the child emitter
reaches a `slot` node, instead of emitting the `data-adx-slot` placeholder it
emits that slot's projected nodes **evaluated in the PARENT's scope** (slot
content is authored by the parent, so it binds to parent state — standard slot
semantics). An empty slot renders nothing (M1 slots are self-closing with no
fallback children, so the placeholder is simply dropped).

**Ownership of projected nodes (MEDIUM-3).** Projected slot nodes are
parent-authored and bound to parent state, but spliced into the child's DOM
position. The design makes their ownership explicit: **projected nodes carry the
PARENT's `scopeId`, the PARENT's instance ordinal (`data-adx-i`), and the
PARENT's instance-scoped `data-adx-b` hook ids** — they are parent-owned for both
CSS isolation and hydration. Only their *DOM position* is the child's. Concretely
the compose layer emits projected nodes by invoking the **parent's** emit pass
(the parent's `CodegenContext` and `EmitState` — same scopeId, same
`instanceIndex`, same shared binding counter) at the point where the child's
`<slot>` placeholder sat, so every attribute and hook id they receive is the
parent's. Consequences that this guarantees:

- The parent's glue (not the child's) wires any `@event`/binding inside slot
  content, because those nodes carry the parent's `data-adx-c` + `data-adx-i` and
  the parent's instance-scoped hook ids; the parent's per-instance loop resolves
  them within the parent's root (which encloses the child's position in the DOM,
  so `root.querySelector` still finds them). A `{{parentState}}` run in slot
  content is therefore patched against the **parent's** `state`, never the
  child's — so it is never blanked/misrendered by the child's glue.
- CSS: slot content matches the parent's scoped rules (parent's `data-adx-c`),
  which is correct because the author wrote it in the parent's `structure.adx`.
- When the parent is itself one of N instances, projected nodes get **that
  parent instance's** ordinal, so slot content for parent-instance `i1` is wired
  and patched by parent-instance `i1`'s loop — consistent with the per-instance
  model above.

The child's glue only ever touches nodes carrying the child's own
`data-adx-c`/`data-adx-i`, so it never patches projected (parent-owned) content.

Test (required, MEDIUM-3): a child with a `slot` whose projected content has a
`{{parentState}}` interpolation and an `@event`; after a parent event mutating
`parentState`, assert the slot content patches from **parent** state and the
projected nodes carry the **parent's** `data-adx-c` (and the parent's
`data-adx-i` when the parent is multi-instance).

Decision: splice projected nodes directly (no wrapper element) for a token-lean,
semantic DOM, and drop the `data-adx-slot` hook in composed output since
projection is resolved at build time (the hook existed in M1 only because
projection was deferred). Documented: `data-adx-slot` placeholders appear only
when a component is compiled standalone (not composed); once composed, slots are
resolved to real content.

### Dependency cycle detection

`emitComponentInstance` threads a `stack: string[]` of absolute component dirs
currently being compiled. Before recursing into a child, if its absolute dir is
already in the stack, throw:

```
[ADX] structure.adx:<line> - Dependency cycle: user-card -> badge -> user-card
```

The line is the custom tag's line in the parent structure. The chain is the
stack joined by ` -> `. A component depending on itself (direct) is caught the
same way. A visited-set also dedupes CSS/glue emission across the DAG.

### Error handling (Phase 3)

| Failure | Recoverable? | Caller receives | Logged |
|---|---|---|---|
| custom tag not in HTML allowlist and not resolved via deps | fatal | `[ADX] structure.adx:<line> - Unknown component "<tag>" (not an HTML element; add to manifest deps)` | stderr, exit 1 |
| dep path in manifest not found/compilable | fatal | `[ADX] manifest.json - Dependency not found: "<dep>"` | stderr, exit 1 |
| dependency cycle | fatal | `[ADX] structure.adx:<line> - Dependency cycle: a -> b -> a` | stderr, exit 1 |
| `<template slot="x">` targets a slot the child does not declare | fatal | `[ADX] structure.adx:<line> - Component "<tag>" has no slot "x"` | stderr, exit 1 |
| two `<template slot="x">` target the same named slot | fatal | `[ADX] structure.adx:<line> - Duplicate slot content for "x"` | stderr, exit 1 |
| required child prop missing after parent passes props | fatal | child's own `[ADX] manifest.json - Missing required prop …` (propagated) | stderr, exit 1 |

### Validation of composition inputs

- A custom tag's `:prop` bindings validate against the child manifest's declared
  props: an unknown prop name is a warning in `adx check` (not fatal) to stay
  authoring-forgiving, consistent with M1's lenient unknown-identifier stance;
  documented. Required-prop enforcement remains fatal (handled by the child's own
  Phase 1 validation).
- `slot="x"` where `x` is not a declared child slot is fatal (table above) —
  this catches typos that would silently drop content and break the page.

### Testability (Phase 3)

Unit: dep-resolution table build; cycle detection with a 2- and 3-node cycle;
slot grouping (named + default). Integration: a `page` composing `site-header`
(with a default slot) and `user-card` (with a `slot="actions"`); assert the child
content appears inside the parent markup, each component's `data-adx-c` is its
own id, both components' CSS appear once and are correctly scoped, and zero `{{`
remain.

---

## Phase 4 — Reactivity semantics (explicit patch contract, no vDOM)

### The guarantee

The `state` the glue mutates and patches from is the browser-side
`const state = setup(mergedProps)` result established in Phase 1's "Build-time ↔
runtime state contract" — NOT a serialized copy of the sandbox state. Because the
glue bakes the merged props (manifest defaults ⊕ `--data`/page `data`), this
runtime `state` equals the build-time state the HTML was rendered from, so the
first patch after hydration reproduces the already-correct DOM (no visible
change) and no SEO/hydration mismatch is possible for a deterministic `setup`
(prior-round HIGH-1). This no-op guarantee holds **because** computed-backed
(`get*`) interpolations are excluded from patching at lowering time (this round's
HIGH-1): the glue carries only `state`, so patching a computed-backed run would
set it to `undefined`/`""` and blank correct content on the first event. By
emitting a `text`/`attr` UpdateInstr only for `state`/`props`/loop-local refs and
freezing computed-backed runs, every instruction the glue runs resolves against
`state` to the same value that was baked in — so the first `rerender()` is a true
no-op for a deterministic `setup`.

When a wired `@event` fires, the glue calls the handler as `handler(state,
event)`. The handler mutates `state` in place (and/or calls `emit`). **On handler
return, the glue re-evaluates the bindings and text of exactly the hooked nodes
whose expressions depend on state, and patches the live DOM text/attributes in
place.** No virtual DOM, no diff of a tree, no re-run of `setup`, no re-render of
unaffected nodes. This is consistent with the hydration-only runtime: the glue
owns a small, explicit set of "update instructions" per hooked node.

### What the glue needs (hook record enrichment)

M1's `BindingHook.bindings: string[]` (names only) is insufficient to patch — we
need, per hooked node, the *instruction* to recompute each binding/text at
runtime. Decision: enrich `BindingHook` and have the glue carry a compiled,
JSON-serializable **update plan** per hook:

```ts
interface BindingHook {
  id: string;
  events: { event: string; handler: string }[];
  // NEW: patch instructions, build-time compiled from the node's bindings/text.
  updates: UpdateInstr[];
}
type UpdateInstr =
  | { kind: "attr"; name: string; expr: SerExpr }       // :prop -> setAttribute
  | { kind: "text"; expr: SerExpr }                       // {{..}} in text node
  | { kind: "attrTemplate"; name: string; parts: SerPart[] }
  | { kind: "textTemplate"; parts: SerPart[] };
type SerExpr = { ident: string } | { member: SerExpr; prop: string };
type SerPart = { lit: string } | { expr: SerExpr };
```

The emitter already walks each node's `bindings` (with `Expr`/`template`) and text
`parts`; it lowers those same `Expr`s into the `SerExpr` form (a trivial 1:1 map
of the AST `Expr`) and attaches them to the hook.

**When a hook is emitted (MEDIUM-5).** M1 emits `data-adx-b` only when
`node.bindings.length > 0 || node.events.length > 0` (verified in `html.ts`), and
interpolated text lives in `TextNode` children, not on the element. M2 widens the
rule: a hook is emitted when a node has **bindings OR events OR a single
interpolated text run** (its children are exactly one `TextNode` carrying at least
one `{{expr}}` part — the dominant `<h2>{{name}}</h2>` case). One hook carries
everything for that node: its `events[]` AND its `updates[]` (attr updates from
`:prop` bindings plus a `text`/`textTemplate` update from the single text run).
So an element that has **both** an `@event` and `{{count}}` text produces one hook
with the event wired and a `text` UpdateInstr — a case the review called out and a
required test asserts.

**Computed-backed text runs are build-time frozen, never text-patched (HIGH-1).**
A bare interpolation can reference a `state`/`props` field *or* a `get*` computed
value (`evaluate.ts` resolves a bare ident against loop → state → props →
computed, verified). The runtime glue carries only `state`, re-runs neither
`setup` nor `get*`, and `evalExpr` walks `state` only. So if a `text`/`textTemplate`
UpdateInstr were emitted for a computed-backed run like `<h2>{{displayName}}</h2>`
(where `displayName` is the `getDisplayName` export, not a `state` field),
`rerender()` would compute `evalExpr({ ident: "displayName" }, state) → undefined`
and set `textContent = toText(undefined) = ""` — blanking the already-correct,
SEO-critical content on the **first** `@event`, even for a fully deterministic
`setup`. That directly contradicts the "first patch is a no-op" guarantee below.
The freeze rule's root-ident test (defined below) also catches member chains like
`{{displayName.length}}` whose root ident is the computed `displayName`.

Decision (fix (a), mirroring the `:for` rule): **during lowering, do not emit a
`text`/`textTemplate`/`attr`/`attrTemplate` UpdateInstr for any run whose
expression's ROOT ident is a computed name.** The rule is defined once and
applied uniformly, so member chains and mixed templates are covered the same way:

```ts
// The base identifier of a SerExpr, unwrapping any member chain to its root.
// rootIdent({ ident: "displayName" })                      === "displayName"
// rootIdent({ member: { ident: "displayName" }, prop: "length" }) === "displayName"
// rootIdent({ member: { member: { ident: "user" }, prop: "a" }, prop: "b" }) === "user"
function rootIdent(e: SerExpr): string {
  return "ident" in e ? e.ident : rootIdent(e.member);
}
```

The emitter holds `ctx.behavior.computed` — the scanner's `get*` export names
(e.g. `getDisplayName`). It derives the set of **bare computed keys** by applying
the Phase 1 lowering (strip the leading `get`, lowercase the first remaining
char: `getDisplayName → displayName`; see Phase 1 / NIT-4 for the byte-exact
rule), building `computedKeys: Set<string>` once per component. The uniform
freeze test is:

> **freeze iff `computedKeys.has(rootIdent(e))`**, applied to:
> - `text` — its single `SerExpr`;
> - `textTemplate` — **each** `expr` part (freeze the whole run if **any** part's
>   root ident is computed);
> - `attr` — its single `SerExpr`;
> - `attrTemplate` — **each** `expr` part (freeze the whole attr if any part's
>   root ident is computed).

A frozen run gets **no** UpdateInstr and is left build-time correct, exactly like
`:for` text — so `{{displayName}}`, `{{displayName.length}}` (member chain rooted
at a computed key), `:src="displayName.url"`, and a mixed
`"{{displayName}} ({{count}})"` template are all frozen because at least one root
ident is computed. Only runs whose every ref roots in `state`/`props`/loop-local
produce an UpdateInstr. (The combined-case rule still holds: an element with an
`@event` plus a *computed*-backed `{{displayName}}` gets a hook for the event but
**no** text update, so the computed text is not blanked; an `@event` plus a
*state*-backed `{{count}}` gets the text update.)

Required test (HIGH-1 / MEDIUM-2): a component exporting `getDisplayName` with
`<h2>{{displayName}}</h2>` and an `@event` elsewhere; render, run the glue,
dispatch the event, and assert `<h2>` text is **unchanged** (not blanked) after
`rerender`. Add a member-expression case `{{displayName.foo}}` (root ident is the
computed `displayName`) and assert it is likewise frozen (no UpdateInstr). A
parallel positive test keeps a state-backed `{{count}}` live-patching.

**Addressability and scope of text patching.** The text update targets the hooked
element's `textContent` only when the element's children are a single text run.
For an element whose children mix interpolation with child *elements*, M2 does
**not** emit a text update and does **not** synthesize wrapper `<span>`s — the
build-time text is still correct, only the live update is skipped (documented
under limits). This keeps M2 bounded and avoids speculative DOM.

**`:for`-unrolled nodes (MEDIUM-5).** `:for` unrolls at build time into N
elements. Each unrolled element gets a hook **only for events** (so a per-item
button still wires its handler); its text and attributes are build-time frozen and
are **never** patched — consistent with "no structural reactivity" (changing the
list in a handler does not re-render it). This is called out explicitly under
Phase 4 limits so an agent does not expect list items to live-update.

### The runtime patch function (in glue — PER-INSTANCE)

The patch helpers are **pure** (shared, module-level) but `rerender`, `byHook`,
and each listener are **per-instance**, closing over that instance's own `state`
and `root` (per the Phase 3 per-instance glue model — HIGH-1/HIGH-2):

```js
// Pure, shared: no reference to any instance's state or root.
function evalExpr(e, state) { /* ident/member walk over state, mirrors evaluate.ts */ }
function applyUpdate(el, u, state) {
  if (u.kind === "text") el.textContent = toText(evalExpr(u.expr, state));
  else if (u.kind === "attr") setOrRemoveAttr(el, u.name, evalExpr(u.expr, state));
  else /* templates */ el.textContent/el.setAttribute = joinParts(u.parts, state);
}

// Per-instance, inside the `for (const inst of INSTANCES)` loop (Phase 3):
//   byHook/rerender close over THIS instance's root + state.
const rerender = () => {
  for (const h of HOOKS) {
    const el = byHook(h.id.replace("{i}", inst.i)); // scoped to inst's root
    if (el) for (const u of h.updates) applyUpdate(el, u, state);
  }
};
```

Each wired listener becomes `(event) => { globalThis.emit = emit;
handler(state, event); rerender(); }` where `state`, `emit`, and `rerender` are
**this instance's**. `rerender` re-applies every hook's update instructions
against this instance's state, resolving nodes only within this instance's root
(so instances never patch each other — HIGH-1). Decision: re-apply **all** this
instance's hooks rather than tracking per-handler dependencies — the hook set per
component is tiny, the ops are direct DOM writes (no diff), and this keeps the
contract dead-simple and correct. (Dependency-precise patching is a later
optimization; documented.) `evalExpr` mirrors `evaluate.ts`'s ident/member walk but over the
single `state` object (loop locals from `:for` are build-time only; see limits).

`toText` and the attr set/remove (remove on null/undefined to mirror the
build-time "omit attribute") are inlined into the glue (a few lines), keeping it
runtime-dependency-free.

### Documented guarantee and limits (goes in agent-reference + grammar + architecture)

Guarantee: after a handler returns, every hooked node's bound attributes and
single-text-run text content reflect the current `state`, patched directly.

Limits (explicit):
- No structural reactivity: `:if`/`:else`/`:for` are resolved at **build time**;
  changing a condition or a list in a handler does **not** add/remove/reorder DOM
  in M2. (Dynamic lists/conditionals are a later milestone.) Documented loudly so
  agents don't expect list growth on click.
- No cross-component reactive props: a parent handler mutating parent state does
  not re-run a child's `setup` or re-patch child-owned nodes (child nodes carry
  the child's hooks and its own state). Parent→child runtime data flow is via
  emitted events only in M2.
- Mixed inline interpolation (`<p>Hi {{name}}, you have {{n}} msgs</p>` with
  other sibling elements) patches the whole element's text run; nodes mixing
  interpolation with child *elements* are not text-patched (documented;
  build-time output is still correct, only the live update is skipped).
- `get*` computed values are evaluated at **build time** for the static HTML; the
  glue does not re-run `get*` on patch in M2 (it patches from `state` only).
  Consequently **computed-backed interpolations are not live-patched in M2**: a
  text run or attribute bound to a `get*` name is left build-time frozen (see
  "Computed-backed text runs are build-time frozen" above), so it keeps its
  correct crawled value and is never overwritten with `undefined`. A handler that
  wants a value to update must mutate the `state` field the binding reads
  directly; routing a displayed value through a `get*` opts it out of live
  patching in M2. (Re-running `get*` on patch is a later milestone.)
- Non-deterministic `setup` (e.g. reading `Date.now()`/`Math.random()`) can make
  the browser `setup(mergedProps)` result differ from the build-time state, so
  first paint may visibly change on hydration. ADX guarantees build/runtime state
  parity only for deterministic `setup`; non-determinism in `setup` is documented
  as the author's responsibility (keep time/random out of `setup`, or accept the
  flash).

### Error handling (Phase 4)

Build-time: lowering an `Expr` to `SerExpr` cannot fail (same restricted grammar).
Runtime (in the browser, not the compiler): `evalExpr` resolving an unknown ident
yields `undefined` → empty text / removed attribute, mirroring build-time
semantics; a handler that throws propagates to the console (not swallowed) and
`rerender` is skipped for that event. These are documented runtime behaviors, not
compiler errors.

### Testability (Phase 4)

Unit: emitter attaches correct `updates` to a hook for `:src`, `{{name}}`, and a
template attr; `SerExpr` lowering round-trips; an element carrying **both** an
`@event` and state-backed `{{count}}` text produces one hook with the event wired
and a `text` UpdateInstr; a `:for`-unrolled element with an event gets an
events-only hook (no text/attr updates); **a computed-backed `{{displayName}}`
(from `getDisplayName`) produces a hook with NO text update (frozen), while a
state-backed `{{count}}` on the same component does get one** (HIGH-1). Integration
(DOM): a component with `getDisplayName`-backed `<h2>{{displayName}}</h2>` plus an
`@event` — dispatch the event and assert the `<h2>` text is unchanged (not
blanked); a sibling state-backed `{{count}}` updates. The glue `rerender`/`evalExpr`
are
pure string-emitted JS — tested by emitting the glue for a fixture and running it
under a jsdom-style DOM in a Vitest environment (Vitest supports `environment:
"jsdom"` via `happy-dom`/`jsdom`; decision: use `jsdom` as a devDependency only if
not already resolvable — otherwise a hand-rolled minimal DOM stub to avoid a new
dep). Decision: add `jsdom` as a devDependency (small, standard) to run the glue
patch path in a real DOM; it stays out of the published `files` list. Assert that
after dispatching the wired event, `textContent`/attributes reflect mutated state.

---

## Phase 5 — Measured token benchmark

### Harness layout

```
benchmark/
  tasks.json             # the comparison tasks + the file sets each measures
  react/                 # equivalent React implementation of the fixture(s)
    UserCard.tsx, UserCard.module.css, ...
  adx/                   # symlink/copy of the ADX fixture(s) measured
  run.ts                 # the measurement script (tsx/node)
  README.md              # how to reproduce
```

`package.json` gains `"benchmark": "node --experimental-strip-types benchmark/run.ts"`
(Node >=18 can't strip types natively on all minors; decision: compile the
benchmark with the project `tsc` into `dist/benchmark/` and run the JS, i.e.
`"benchmark": "tsc -p tsconfig.json && node dist/benchmark/run.js"`, to avoid a
`tsx`/loader dependency). `gpt-tokenizer` is the only new devDependency.

### Methodology (documented, reproducible)

Measure **three tasks** mirroring `docs/comparison.md`, each defined as a concrete
operation on a concrete file set, so the number is reproducible, not a vibe:

1. **Understand** — tokens to read the full component source needed to understand
   it: ADX = `manifest.json` + `structure.adx` + `behavior.adx.js` +
   `style.adx.css`; React = `UserCard.tsx` + `UserCard.module.css`. Metric: sum of
   `encode(file).length` over the set.
2. **Modify-style** — tokens to read just the file(s) a style change touches:
   ADX = `style.adx.css`; React = `UserCard.module.css`. (Read cost, the dominant
   agent cost.)
3. **Add-prop** — tokens to read the file(s) an "add a prop" change touches:
   ADX = `manifest.json` + `structure.adx` + `behavior.adx.js`; React =
   `UserCard.tsx` (+ `types.ts` if present).

The harness tokenizes each file with `gpt-tokenizer` (`cl100k_base`/`o200k_base`
— decision: use the GPT-4o `o200k_base` encoder as the current default, and print
which encoder was used), sums per task per framework, computes
`savings = (react - adx) / react`, and writes a results table to stdout and to
`benchmark/results.json`.

**React-fixture equivalence rule (NIT-5).** A savings number is only credible if
the React fixture is a faithful equivalent of the ADX fixture, so equivalence is
defined and enforced, not assumed. The React implementation under
`benchmark/react/` MUST: (a) render the **same DOM structure and visible text**
as the ADX component for the same inputs; (b) expose the **same props** (same
names, same required/optional, same defaults); and (c) carry the **same styling
surface** (the same CSS rules/classes, so neither side is under- or
over-specified). The React files are committed (not generated) and reviewed for
this parity, so anyone can `git diff` the two implementations and reproduce the
measurement. A short "Equivalence" note in `benchmark/README.md` records what was
checked. If parity cannot be met for a construct, that task is excluded from the
measured set rather than silently inflating savings.

### Honesty rule

The design mandates: `docs/comparison.md` and `docs/token-efficiency.md` get a new
**"Measured (M2)"** section with the real table, clearly separated from and
labeled as superseding the prior **hand-estimated** figures (the old numbers are
kept but marked "estimated, pre-measurement"). The exact current headline being
superseded is, verbatim, **"Token Efficiency: 65-85% reduction vs. traditional
frameworks"** (`docs/comparison.md` Summary; the per-task estimates there cite
73% / 81% / 86% / 95%). NIT-1: the Measured (M2) section names this "65-85%"
figure as the estimate it replaces so the honesty-rule diff is unambiguous.

If measured savings fall below that advertised range, the **claim** in
README/architecture/comparison is adjusted to the measured range (e.g. "~X% on
the measured tasks"), not the measurement. The headline claim becomes a measured
range with a pointer to `npm run benchmark`.

### Error handling (Phase 5)

Benchmark is a dev tool: a missing fixture file or encoder import failure throws
and fails `npm run benchmark` with a plain Node error (not `[ADX]` — this is not
compiler output). Documented in `benchmark/README.md`.

### Testability (Phase 5)

The `run.ts` tokenizing/aggregation logic is factored into a pure
`measure(fileSets): Results` function unit-tested with tiny in-memory strings and
a stubbed encoder, so the math is tested without depending on exact model token
counts. The end-to-end `npm run benchmark` is a manual/CI reproducibility check.

---

## Phase 6 — Documentation sync (same change)

Each shipped capability updates docs in the same change; mark only what works.

- `docs/adx-grammar.md`: move component resolution + slot projection from "later
  milestone" to specified — add a section defining custom-tag resolution against
  `manifest.deps`; the two slot sides (child declares `<slot actions />`, parent
  projects `<template slot="actions">`), stating `<slot name="actions"/>` is NOT
  valid; `<template slot="name">` projection with `#name` noted as planned sugar
  that is *already parseable today* (do not claim a parser change is needed —
  HIGH-3); the build-time nature of slots; that `data-adx-slot` placeholders only
  appear in standalone compilation; and the per-instance hydration attribute
  `data-adx-i="i<ordinal>"` plus the three-part hook id
  `${scope}-i${ordinal}-${n}`. Pin §4.3's `get*`→bare-key lowering to the exact
  rule (strip `get`, lowercase only the first remaining char; `getURL → uRL`) so
  the grammar and the `bareComputedKey` helper agree (NIT-4).
- `docs/agent-reference.md` (compact/scannable): add `--data <file.json>`, the
  page-manifest shape + `adx build <page.json>`, composition syntax, the
  reactivity contract + its limits, and the `npm run benchmark` command. Update
  the CLI "IMPLEMENTED vs PLANNED" lists.
- `docs/human-guide.md` (warm): a worked example building a **small 2-page site
  from 2 composed components with real data** (`index` + `about`, a `site-header`
  used on both, a `user-card` with `--data`/page data). Replace the `#actions`
  slot example with `slot="actions"` + a planned-`#`-sugar note. Fix the stale
  "scanned, never executed" phrasing about `behavior.adx.js` to describe
  sandboxed `setup()` execution and its security posture.
- `docs/architecture.md`: update the Runtime section (build-time `setup()`
  sandbox; reactivity patch model) and the "Compiling runs user code" security
  note; flip the relevant claims to measured.
- `docs/comparison.md` + `docs/token-efficiency.md`: add the Measured (M2) table;
  label prior numbers estimated; adjust the headline claim to the measured range
  if needed.
- `docs/roadmap.md`: move shipped M2 items from ❌/🚧 to ✅ (data binding, pages,
  composition, reactivity, benchmark, doc sync) and update the "Next up" framing.
- `README.md`: roadmap rows + "Next up" line; keep version/status accurate.

Documentation is part of definition-of-done, not a follow-up (per steering).

---

## Cross-cutting: SEO contract verification

Every page/component output is verified to contain real content before JS:
integration tests read the emitted `index.html` and assert (a) zero `{{`
substrings, (b) the resolved data values are present (e.g. the supplied `name`
appears inside `<h2>`), (c) `<title>`/`<meta name="description">`/`<link
rel="canonical">`/OG/Twitter are present, and (d) `lang` on `<html>`. The
sandboxed `setup()` is what makes (b) real now instead of empty. `sitemap.xml`/
`robots.txt` generation remains a later milestone (out of scope — noted) so M2
does not claim it.

## New/changed files map

- New: `src/behavior/run.ts` (sandbox), `src/page/load.ts` (+types),
  `src/page/compile.ts`, `src/codegen/html-tags.ts` (HTML allowlist),
  `src/codegen/compose.ts` (instance emission + slot projection, or folded into
  `html.ts`), `benchmark/` tree, new fixtures (`fixtures/site/` with a page
  manifest, `site-header`, and a `user-card` instance), React mirror under
  `benchmark/react/`.
- Changed: `src/cli.ts` (`--data`, page-vs-component dispatch), `src/compile.ts`
  (`resolveProps`, sandbox call, scope includes `computed` via `bareComputedKey`
  — NIT-4; pass `mergedProps` into the context; compute `repoRoot` and pass
  `relative(repoRoot, absDir)` (POSIX-normalized) as `scopeId` location for
  composed children — MEDIUM-3/NIT-2), `src/behavior/compute-key.ts` (NEW: the
  shared `bareComputedKey(exportName)` helper — NIT-4; used by `compile.ts` to
  build `scope.computed` and by `html.ts` to build the Phase 4 `computedKeys`
  freeze set), `src/codegen/context.ts` (`CodegenContext` gains per-component
  `mergedProps` **and** a per-instance `INSTANCES` accumulator carrying each
  instance's `instanceIndex` + merged props for the glue — HIGH-1; the shared
  page-global instance-ordinal counter — MEDIUM-4), `src/codegen/html.ts`
  (custom-tag resolution; slot projection emitting projected nodes under the
  **parent's** scope/instance ordinal/hook ids — MEDIUM-3; enriched
  `BindingHook.updates` with the `rootIdent`-based computed freeze — MEDIUM-2;
  single-text-run hook emission — MEDIUM-5; instance-ordinal `data-adx-b` ids via
  `instanceBindingId` — MEDIUM-4; stamp a per-instance `data-adx-i="i<ordinal>"`
  on each instance root — HIGH-1/HIGH-2), `src/codegen/glue.ts` (emit the
  per-instance module: an `INSTANCES` array looped so each instance gets its own
  `setup(mergedProps)` → `state`, its own `data-adx-c`+`data-adx-i` root locator,
  its own `emit` closure, and its own `rerender` scoped to that root — HIGH-1,
  HIGH-2; bake **merged** props per instance not just defaults; `globalThis.__ADX_PROPS__`
  — NIT-1; serialized `updates`; shared pure `evalExpr`/`applyUpdate`),
  `src/codegen/scope.ts` (additive: new `instanceBindingId(scope, instanceIndex,
  n)` for the three-part hook id — NIT-1(prev); existing `bindingId`/`scopeId`
  signatures unchanged; `scopeId` still hashes verbatim — the caller does the
  repo-relative normalization, NIT-2), `src/manifest/*` (optional: a
  `deps`→resolved map helper), `src/index.ts` (new exports). `src/codegen/css.ts`,
  `evaluate.ts`, parser/AST unchanged in shape (parser gains nothing —
  `<slot actions />` and `<template slot=…>` already parse, HIGH-3/MEDIUM-1).
- Docs: all six listed in Phase 6.

## Risks and unverifiable assumptions

1. **`node:vm` is not a security boundary.** `vm` prevents *ambient* access by
   omitting globals, but it is documented by Node as not a robust sandbox against
   a determined attacker (prototype/`constructor` escapes to the host realm are
   possible). The locked decision is sandboxed `vm` execution with no
   require/fs/net/process + timeout, which satisfies the stated contract
   ("dangerous calls fail because those globals are absent") and the "same caution
   as any untrusted build tool" caveat. We will **document this limit explicitly**
   rather than over-claim isolation. If stronger isolation is later required, a
   child-process or worker boundary is the upgrade path (noted, out of scope).
2. **ESM `setup()` in `vm`.** `vm.Script` runs a classic script, not an ES
   module. The "strip `export`, append a return expression" transform works for
   the documented behavior shape (top-level `export function/const`) but will fail
   on `import` statements or exotic module features. Assumption: M2 behavior files
   are self-contained (the fixture is). Documented as a constraint; a full
   `vm.SourceTextModule`-based path (behind `--experimental-vm-modules`) is a
   possible later upgrade.
3. **Reactivity text-patch scope.** Limiting live text patching to single-text-run
   elements avoids speculative wrapper spans but is a real limit; verified against
   the fixtures/docs where `<h2>{{name}}</h2>` is the pattern. If a core doc
   example mixes text + elements and expects live updates, we adjust the example,
   not the contract.
4. **`<template slot="name">` as the canonical projection form.** Both
   `<template slot="name">` and `<template #name>` already parse today (the
   tokenizer captures attrs raw and `splitAttributes` imposes no charset — HIGH-3,
   re-verified against `tokenizer.ts`/`parser.ts`). M2 picks `slot="name"` for
   clarity and a single canonical spelling, not out of any parser limitation.
   `#name` is documented as planned sugar and explicitly noted as parseable now.
   This diverges from the human-guide's current `#actions` examples, which are
   updated to `slot="actions"` with that note. Assumption: changing doc examples
   is acceptable (it is, per the documentation-sync rule). No tokenizer/parser
   change is claimed or needed.
5. **Benchmark may undershoot the advertised range.** The current headline is
   "65-85% reduction vs. traditional frameworks" (`docs/comparison.md` Summary;
   the mission steering separately targets "60-80%"). The hand estimates were
   generous. The honesty rule commits us to publishing the measured number and
   adjusting the *claim* (not the measurement) to the measured range if it falls
   below either figure. This is a documentation/claim risk, not a build risk.
6. **`check` now fails on required-prop-without-data.** This is a deliberate,
   documented behavior change from M1 (where such a component "passed" by
   emitting an empty element). It is the whole point of Phase 1 but will change
   the result of `adx check` on the bundled fixture if run without `--data`;
   the fixture/tests are updated accordingly (the fixture's `name` is required
   with no default, so the fixture gains a sample data file and the integration
   tests supply it). Per MEDIUM-6, `adx check <page.json>` validates every
   instance's merged props, and a composed-only child failing a standalone
   `check` without `--data` is the intended, documented behavior (check it via
   its page or with sample `--data`).

## Open items intentionally deferred (Out of scope for M2)

Runtime prop-type checking against `PropDef.type`; dynamic list/conditional
reactivity; dependency-precise (not whole-component) patching; shared hashed asset
dir across pages; `sitemap.xml`/`robots.txt`; `#name` slot sugar; worker/
child-process-grade sandbox isolation; single-component per-build SEO overrides
(`canonical`/`lang` on `SeoMeta` — single-component builds stay M1-fixed, NIT-2);
`adx dev`/`create`/`tokens`/`pattern`.
Each is noted inline above where relevant.

---

## Responses to design review (revision 3 — latest round)

Review: `.agents/tasks/design-review.md` (revision 2) / `design-verdict.json` —
CHANGES_REQUESTED (2 HIGH, 3 MEDIUM, 4 NIT). All nine findings are **addressed**
(none backlogged, none ignored). Every resolution conforms to the hard,
pre-decided **per-instance** hydration model (see the constraint box at the top)
and changes no locked decision.

| Finding | Resolution |
|---|---|
| **HIGH-1** — one `root`/one `state` per glue module cannot hydrate N instances | Addressed with the per-instance glue module (Phase 3 §3). The emitted module carries an `INSTANCES` array (one record per instance, each with its own `instanceIndex` and its own merged props) and loops: each iteration declares its **own** `const state = setup(inst.props)`, locates its **own** root via `[data-adx-c=SCOPE][data-adx-i=i<ordinal>]`, and resolves its hooks within that root only. No instance reads another's state. A new per-instance root attribute `data-adx-i="i<ordinal>"` (stamped in `html.ts`) is the root discriminator since `data-adx-c` is shared for CSS. Required two-instance independent-hydration test specified. |
| **HIGH-2** — child `emit` dispatches on the first instance's shared `data-adx-c` root | Addressed (Phase 3 §3). `emit` is now **instance-aware**: each instance's loop iteration builds `const emit = (name, detail) => root.dispatchEvent(new CustomEvent(...))` closing over **that instance's** root, and the free `globalThis.emit` is set to the current instance's `emit` immediately before each (synchronous) handler runs. The Nth instance's emit therefore dispatches on the Nth instance's root with correct `event.target` ancestry. Required test: click the second instance, assert the parent handler sees the event from the second instance's `data-adx-i="i1"` subtree. |
| **MEDIUM-1** — `get*` timeout mechanism self-contradiction (host-side vs `runInContext`) | Addressed. One mechanism only: in-context, timed `runInContext`. `setup` runs via the appended `;globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__);` under a single timed `runInContext`; each `get*` is a pre-compiled per-`get*` `vm.Script` writing `globalThis.__ADX_COMPUTED__`, invoked by its own timed `runInContext` and read back immediately. The host-side `() => fns.getDisplayName(state)` form is deleted; the single-shared-`__ADX_STATE__` reference is preserved. Re-entrancy noted (lazy single reads). |
| **MEDIUM-2** — computed-freeze rule did not cover member-expression roots uniformly | Addressed. Defined `rootIdent(SerExpr)` (unwrap `.member` to the base ident) and apply **freeze iff `computedKeys.has(rootIdent(e))`** uniformly to `text`, `textTemplate` parts, `attr`, and `attrTemplate` parts (freeze the whole run/attr if any part's root ident is computed). Added `{{displayName.foo}}` frozen test. |
| **MEDIUM-3** — ownership of projected slot nodes unspecified | Addressed. Projected slot nodes carry the **parent's** `scopeId`, the **parent's** instance ordinal (`data-adx-i`), and the parent's instance-scoped hook ids (parent-owned for CSS and hydration); only their DOM position is the child's. The parent's glue wires any `@event`/binding inside slot content and patches `{{parentState}}` against parent state; the child's glue never touches them. Required slot-content `{{parentState}}` + `@event` test specified. |
| **NIT-1** — `window.__ADX_PROPS__` vs `globalThis.__ADX_PROPS__` | Addressed. The design, the sandbox globals, and the glue all use `globalThis.__ADX_PROPS__` (and `globalThis.__ADX_STATE__`/`__ADX_COMPUTED__`) consistently, matching the emitted code and the jsdom/Node harness. |
| **NIT-2** — `scope.ts` repo-relative normalization asserted but absent; `repoRoot` undefined | Addressed. `scope.ts` hashes verbatim (unchanged); the **caller** (`compile.ts`/`compilePage`) computes `relative(repoRoot, absDir)` (POSIX-normalized) before hashing. `repoRoot` = nearest ancestor containing `package.json` (walking up from the build input), else the input's own dir. |
| **NIT-3** — page JSON-LD body unspecified | Addressed. `wrapPageDocument` emits (schema-gated) `{ "@context":"https://schema.org", "@type": page.schema, "name": page.title }`; SEO test asserts the page's JSON-LD `@type`/`name`. |
| **NIT-4** — `get*`→bare-key lowering called "already shared" but absent in M1 | Addressed. Reworded as **new Phase 1 work** (`bareComputedKey` helper in `src/behavior/compute-key.ts`) that Phase 4 reuses. Lowering pinned byte-for-byte: strip leading `get`, lowercase **only** the first remaining char; acronym case decided `getURL → uRL`. Grammar §4.3 updated to match. |

No locked decision was changed, and the per-instance model was applied, not
re-litigated. HIGH-1/HIGH-2 are closed by the per-instance glue module +
`data-adx-i` discriminator; MEDIUM-1 by the single `runInContext` timeout path;
MEDIUM-2 by `rootIdent`; MEDIUM-3 by parent-ownership of projected nodes; the
NITs by the consistency/pinning fixes above.

## Responses to design review (revision 2)

Review: `.agents/tasks/design-review.md` (revision 1) / `design-verdict.json` —
CHANGES_REQUESTED (1 HIGH, 2 MEDIUM, 3 NIT). All six findings are **addressed**
(none backlogged, none ignored). Each change aligns with the original requirements
and the locked decisions, and no locked decision was altered. The findings were a
new contradiction the revision-1 widening introduced plus two mechanism gaps and
three polish items — all closed without changing any locked choice.

| Finding | Resolution |
|---|---|
| **HIGH-1** — widened text-run patching blanks `get*`-backed text on the first event (contradicts the "first patch is a no-op" guarantee) | Addressed via fix (a). Phase 4 now freezes computed-backed interpolations at lowering: a text run (or `:prop`) whose bare `SerExpr` ident is a known `computed` name (from `ctx.behavior.computed`; for a `textTemplate`, if any `expr` part is computed-backed) gets **no** `text`/`attr` UpdateInstr and stays build-time frozen like `:for` text. Only `state`/`props`/loop-local refs are live-patched. "The guarantee" paragraph is reconciled to say the no-op holds *because* of this freeze. The `get*` limits bullet now states "computed-backed interpolations are not live-patched in M2". Required tests added: a `getDisplayName`-backed `{{displayName}}` + an `@event` asserts the text is unchanged (not blanked) after `rerender`, with a parallel positive test that a state-backed `{{count}}` does patch. |
| **MEDIUM-1** — sandbox module transform (`export`-strip + return list) underspecified | Addressed. Phase 1 step 2 now specifies: (1) strip **only the leading `export ` keyword** of each `EXPORT_RE` match, preserving the rest verbatim, so `export function`, `export async function`, `export function*`, and `export const/let/var setup = …` all survive — splicing out matches left-to-right; (2) build the invocation **after** the `hasSetup` fatal-check, invoking exactly `setup` (only if present) + the `get*` computed names in the scanner's sorted order, never `events`/`lifecycle`/`other`. Unit tests for both `export function setup` and `export const setup = (p) => ({…})`, for a never-invoked unused `get*`, and for the no-`setup` fatal ordering are specified. |
| **MEDIUM-2** — only `setup`/`get*` invoked; freeze semantics unspecified | Addressed. Phase 1 step 1 now states explicitly that after the strip the whole module body is *declared* but only `setup` (and lazily each referenced `get*`) is **invoked** — handler bodies with free `emit`/`document`/`event` are inert at build time (declaration ≠ call, so no `ReferenceError`). Freeze semantics pinned: the context *seed* object is `Object.freeze`d before `vm.createContext` (defense-in-depth, not a boundary per Risk 1), and in-sandbox reassignment of a free name is harmless because the sandbox realm is discarded after the build. |
| **NIT-1** — `${scope}-i${instanceIndex}-${n}` can't come from `bindingId`, but files-map said "no signature change" | Addressed. `scope.ts` gains an additive sibling `instanceBindingId(scope, instanceIndex, n)` returning the three-part id; `bindingId`/`scopeId` are unchanged. The Phase 3 section and the files-map line are corrected to describe the additive change (the prior "no signature change" note is replaced). |
| **NIT-2** — page dispatch ambiguity (`.json` arg vs dir containing `page.json`) | Addressed. The "dir containing `page.json`" alternative is dropped. Dispatch is a strict 3-step rule: `.json` arg → page; dir with `manifest.json` → component; else error. A dir holding both `manifest.json` and a stray `page.json` is unambiguously a component build; pages are only ever the top-level `.json` positional arg. |
| **NIT-3** — required-prop hint hardcodes "via --data" even for page/composed paths | Addressed. `resolveProps(manifest, data, source)` takes a `source: "standalone" \| "page" \| "composed"` discriminator and branches the parenthetical hint ("none supplied via --data" / "no value in the page's component data" / "no value passed by the parent"); the `Missing required prop "<name>" (no default and …` stem and the line-less `manifest.json` format are unchanged. Phase 2 and Phase 3 pass the matching `source`. |

No locked decision was changed. HIGH-1 is closed by mirroring the existing `:for`
build-time-freeze rule (consistent with the hydration-only runtime and the
SEO-static-first contract), not by adding a vDOM or re-running `get*`.

## Responses to design review (revision 1)

Review: `.agents/tasks/design-review.md` — CHANGES_REQUESTED (3 HIGH, 6 MEDIUM,
5 NIT). All findings are **addressed** (none backlogged, none ignored); each
change aligns with the original requirements and the locked decisions.

| Finding | Resolution |
|---|---|
| **HIGH-1** — which `state` Phase 4 patches | Addressed. New "Build-time ↔ runtime state contract" in Phase 1: the browser-side `setup(mergedProps)` is the single runtime source of truth; `emitGlue` now bakes the **merged** props (defaults ⊕ `--data`/page `data`), not just defaults, so first-paint state == build-time state; `CodegenContext` carries `mergedProps`; a required integration test asserts pre-JS HTML == post-hydration DOM before any event. Phase 4 "The guarantee" updated to reference it; non-deterministic `setup` called out as a limit. |
| **HIGH-2** — JSON-clone vs live `get*` state divergence | Addressed. Decision reversed: **no JSON clone** — `runSetup` returns the exact in-context state object; the emitter and every `get*` thunk share that one reference, so direct bindings and `get*` always agree even for `Date`/`Map`/getters. Non-JSON values render via `toText`→`String`. |
| **HIGH-3** — false "`#` not in attribute charset / parser change required" | Addressed. Re-verified `tokenizer.ts`/`parser.ts`: `<template #actions>` already parses (raw attr capture, no charset in `splitAttributes`). The false claim is removed. `slot="name"` kept as canonical, justified on clarity (no special branch), with `#name` documented as *parseable-now* sugar deferred only for simplicity. Risk 4 and the grammar doc-bullet corrected. |
| **MEDIUM-1** — slot declaration vs projection forms | Addressed. Phase 3 and the grammar bullet now state both: child declares `<slot actions />` (unchanged M1 form), parent projects `<template slot="actions">`; `<slot name="actions"/>` is NOT valid and still errors. Tests specified. |
| **MEDIUM-2** — `<template>` grouping edge cases | Addressed. Specified: no-target template → default; non-template child → default; duplicate named-slot projection → fatal `[ADX] structure.adx:<line> - Duplicate slot content for "x"` (added to error table); whitespace-only text ignored; self-closing custom element projects nothing. Table-driven tests noted. |
| **MEDIUM-3** — child `scopeId` location collisions | Addressed. Recursive compilation passes the **resolved absolute (repo-relative) dir** as `scopeId`'s `locationPath` (matching the dedupe rule); single-component keeps `basename`. One component used N times → one CSS block, N bodies sharing the scope id. |
| **MEDIUM-4** — `data-adx-b` uniqueness across a page | Addressed. New "Hook-id uniqueness across a page" section: ids become `${scope}-i${instanceIndex}-${n}` via a page-global instance ordinal threaded through the emit; each instance's glue selects by scope+ordinal+index. Repeated-component test specified. |
| **MEDIUM-5** — text-node hook placement / `:for` / combined hook | Addressed. Hook emitted on bindings OR events OR single-text-run interpolation; one hook carries `events[]` + `updates[]`; `:for`-unrolled nodes get events-only hooks (text/attrs frozen). Test for an element with an event + `{{count}}` text added. |
| **MEDIUM-6** — page `check` + composed-only children | Addressed. `adx check <page.json>` validates every instance's merged props and fails per missing required prop; standalone `check` on a composed-only child failing without `--data` documented as intended (Risk 6), with guidance to check via the page or sample `--data`. |
| **NIT-1** — savings range quoted inconsistently | Addressed. Honesty rule and Risk 5 now cite the verbatim current headline "65-85% reduction vs. traditional frameworks" as the figure the Measured (M2) section supersedes. |
| **NIT-2** — single-component `lang`/`canonical` stay M1-fixed | Addressed. Phase 2 notes single-component `wrapDocument` stays M1-fixed (root canonical, `lang="en"`); real per-page SEO comes from the page manifest; single-component SEO overrides listed in Out of Scope. |
| **NIT-3** — `emit` stub / `console` under-specified | Addressed. Sandbox step 1 states `emit` returns `undefined` and records nothing at build time; `console` methods are no-ops returning `undefined`; emits only matter at runtime. |
| **NIT-4** — `components[].use` resolution | Addressed. `use` must be a component directory, never a page manifest; nesting pages out of scope. |
| **NIT-5** — React-fixture equivalence | Addressed. Equivalence rule added: same DOM/text, same props, same styling surface; committed and reviewed for parity; non-parity tasks excluded rather than inflating savings. |

No locked decision was changed. The only doc-overstatement risk (HIGH-3's false
parser claim) is removed and will not reach the grammar/human-guide.
