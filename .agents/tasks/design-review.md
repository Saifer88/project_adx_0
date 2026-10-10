# ADX Milestone 2 — Design Review (revision 3 of the design)

Reviewer: fresh-eyes design reviewer (no authoring context).
Design under review: `.agents/tasks/m2-design.md` ("revision 3").
Authoritative spec: `docs/roadmap.md` → "Milestone 2" + `.kiro/steering/`.
Method: every claim the design makes about M1 source was re-checked against the
actual files in `.worktrees/adx-m2/src/**`. The prior review
(`design-review.md` rev 2 / `design-verdict.json`: 2 HIGH / 3 MEDIUM / 4 NIT)
listed the open findings; each is judged below for genuine closure, and the
revision scanned for any new contradiction.

Pre-decided hard constraint (NOT re-litigated): hydration glue is **per-instance,
not per-component** — N instances each get their own state and hydrate only their
own root; events/emit/reactivity resolve against the nearest enclosing instance
root; each instance has a distinct instance id. This review only judges whether
the design now specifies that model coherently; it does not re-open the decision.

Verdict: **APPROVED** — 0 HIGH, 0 MEDIUM, 2 NIT.

All five previously-open HIGH/MEDIUM findings are genuinely closed against the
real M1 source, and all four prior NITs are addressed. The per-instance model is
specified coherently end to end (emitter stamps a per-instance root discriminator,
the glue loops over an `INSTANCES` array with its own `setup`/`state`/`emit`/
`rerender` per instance, hooks resolve only within each instance's root). The two
NITs below do not block.

---

## Previously-open findings — closure assessment

### HIGH-1 (per-instance glue module shape) — CLOSED

Prior gap: the emitted glue had one `root = querySelector('[data-adx-c=SCOPE]')`
(first match only) and one `state = setup(props)`, so N instances of one
component could not hydrate independently; the instance-ordinal hook ids were
necessary but not sufficient without a defined module shape.

Verified against source: `src/codegen/glue.ts` indeed emits a single
`const root = document.querySelector('[data-adx-c="' + SCOPE + '"]')` and a single
`const state = setup(props)` — the gap was real.

Resolution (Phase 3 §"Per-instance identity" subsections 1–3, and the files-map):

- A per-instance root discriminator `data-adx-i="i<ordinal>"` is stamped on each
  instance root in `html.ts`, *in addition to* the shared CSS-isolation key
  `data-adx-c`. Rationale for an explicit attribute (vs. addressing the root by a
  `data-adx-b` id) is given and sound: a root may carry no `data-adx-b` at all.
- The glue is replaced by a module carrying an `INSTANCES` array (one record per
  instance, each with its own `instanceIndex` and its own merged props) and a
  `for (const inst of INSTANCES)` loop that declares `const state =
  setup(props)` inside the loop, locates its root via
  `[data-adx-c="SCOPE"][data-adx-i="i<ordinal>"]`, and resolves hooks via a
  `byHook` scoped to that `root` (`root.matches(...) ? root :
  root.querySelector(...)`).
- Hook ids are three-part `${scope}-i${instanceIndex}-${n}` via an additive
  `instanceBindingId(scope, instanceIndex, n)` in `scope.ts`; the per-instance
  `{i}`-templated id keeps the shared `HOOKS` structure emitted once.
- `CodegenContext` gains `mergedProps` + an `INSTANCES` accumulator and the
  shared page-global ordinal counter; the files-map names `glue.ts`, `html.ts`,
  `context.ts`, `scope.ts`.
- Required two-instance independent-hydration test is specified.

This is a coherent per-instance module shape that consumes the id scheme it
defines. No instance can read another instance's state (the `const state` is
loop-local) and lookups are root-scoped. Matches the pre-decided constraint.
**Genuinely closed.**

### HIGH-2 (instance-aware emit) — CLOSED

Prior gap: the free `emit` dispatched on `root = querySelector('[data-adx-c=SCOPE]')`
(first match), so every instance's `emit` fired on the first instance's root.

Verified against source: `glue.ts` sets `globalThis.emit` to a closure over the
single `root` — the cross-instance bug was real.

Resolution (Phase 3 §3): each loop iteration builds its own
`const emit = (name, detail) => root.dispatchEvent(new CustomEvent(name,
{ detail, bubbles: true }))` closing over *that instance's* root, and
`globalThis.emit = emit` is set immediately before each (synchronous) handler
runs. The concurrency reasoning is explicit and correct: DOM event callbacks are
synchronous and non-reentrant on the single JS thread, so the per-handler
assignment of the shared `globalThis.emit` cannot interleave across instances.
The alternative (pass `emit` as a third handler arg) is noted and deferred to
keep the M1 `handler(state, event)` scanned contract stable — a legitimate call,
not a locked-decision change. The required second-instance emit test is
specified. **Genuinely closed.**

### MEDIUM-1 (single timed `get*` mechanism) — CLOSED

Prior contradiction: step 5 described host-side `() => fns.getDisplayName(state)`
(not timeout-bounded) while "Timeout enforcement" described an in-context
`runInContext`.

Resolution (Phase 1 sandbox step 4/5 + "Timeout enforcement"): one mechanism
only — in-context, timed `runInContext`. `setup` runs via the appended
`;globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__);` under a single
timed run; each `get*` is a pre-compiled per-`get*` `vm.Script` writing
`globalThis.__ADX_COMPUTED__`, invoked by its own timed `runInContext` and read
back immediately. The design states explicitly "The host-side `() =>
fns.getDisplayName(state)` form is removed; it would have escaped the timeout and
is explicitly not used." The single-shared-`__ADX_STATE__` reference guarantee is
preserved (no clone), so a `get*` and a direct binding always see one identical
state object. Re-entrancy on the single `__ADX_COMPUTED__` slot is addressed:
reads are lazy and single (`evaluate` consumes `ctx.__ADX_COMPUTED__` before the
next thunk runs). This matches `evaluate.ts`'s thunk contract (a computed value
may be a function called on read). No contradiction remains. **Closed.**

### MEDIUM-2 (rootIdent-based uniform freeze) — CLOSED

Prior gap: the freeze rule tested "the bare `SerExpr` ident", which misses
member chains like `{{displayName.length}}` whose top-level node has no `ident`.

Verified against source: `evaluate.ts` `resolveIdent` resolves the *base* name,
then member-access walks outward — so the freeze test must key on the chain's
root ident. The `Expr` AST (`ast.ts`) is `{kind:"ident",name}` /
`{kind:"member",object,property}`; the design's `SerExpr`
(`{ident}` / `{member,prop}`) is a faithful 1:1 lowering.

Resolution (Phase 4): `rootIdent(SerExpr)` is defined (unwrap `.member` to the
base `ident`) with worked examples, and the uniform rule **freeze iff
`computedKeys.has(rootIdent(e))`** is applied to `text`, each `textTemplate`
part, `attr`, and each `attrTemplate` part (freeze the whole run/attr if any
part's root ident is computed). `computedKeys` is derived via the shared
`bareComputedKey` helper (NIT-4). Member-chain frozen test (`{{displayName.foo}}`)
plus a state-backed positive test are specified. Uniform and correct. **Closed.**

### MEDIUM-3 (parent-owned projected slot nodes) — CLOSED

Prior gap: ownership (scopeId + instance ordinal + glue) of projected slot nodes
that bind to parent state but live in the child's DOM position was unspecified.

Resolution (Phase 3 §"Ownership of projected nodes"): projected nodes carry the
**parent's** `scopeId`, the **parent's** instance ordinal (`data-adx-i`), and the
parent's instance-scoped hook ids — parent-owned for both CSS and hydration; only
their DOM position is the child's. The compose layer emits them by invoking the
*parent's* emit pass (same `CodegenContext`/`EmitState`, same scopeId, same
`instanceIndex`, same shared counter) at the `<slot>` placeholder position. The
parent's per-instance loop resolves them via `root.querySelector` (the parent
root encloses the child's DOM position, so the lookup still finds them); the
child's glue only ever touches nodes carrying the child's own
`data-adx-c`/`data-adx-i`, so it never patches parent-owned slot content. The
multi-instance-parent case is covered (slot content gets that parent instance's
ordinal). Required `{{parentState}}` + `@event` test specified. Coherent with the
per-instance model and the CSS-isolation design. **Closed.**

### NIT-1 (`globalThis.__ADX_PROPS__`) — CLOSED

Verified: `glue.ts` reads `globalThis.__ADX_PROPS__`. The design now uses
`globalThis.__ADX_PROPS__` / `__ADX_STATE__` / `__ADX_COMPUTED__` consistently in
the sandbox globals, the emitted glue, and the jsdom/Node harness.

### NIT-2 (`scope.ts` normalization is caller work; `repoRoot` pinned) — CLOSED

Verified: `scope.ts` `scopeId(name, locationPath)` hashes `name\u0000locationPath`
verbatim with no normalization. The design now states the **caller**
(`compile.ts`/`compilePage`) computes `relative(repoRoot, absDir)`,
POSIX-normalizes separators, and passes that; `repoRoot` is pinned as the nearest
ancestor containing `package.json` (else the input dir). Confirmed a
`package.json` exists at the worktree root, so this is deterministic and
machine-independent as claimed.

### NIT-3 (page JSON-LD body) — CLOSED

Verified: M1 `wrapDocument` emits `{ "@context":"https://schema.org", "@type":
seo.schema, name: ctx.manifest.name }`, schema-gated. The design specifies
`wrapPageDocument` emits (schema-gated) `{ "@context", "@type": page.schema,
"name": page.title }` and asserts the page's JSON-LD `@type`/`name` in the SEO
test. Matches the M1 shape, adapted to a page's lack of `manifest.name`.

### NIT-4 (`get*`→bare-key lowering is new Phase 1 work, pinned) — CLOSED

Verified: `compile.ts` sets `scope = { state, props }` with no `computed` key;
`scan.ts` stores raw `get*` names; no lowering exists in `src/`. The design now
calls this **new Phase 1 work** (`bareComputedKey` in
`src/behavior/compute-key.ts`), reused by Phase 4, with the lowering pinned
byte-for-byte (strip leading `get`, lowercase only the first remaining char;
acronym case decided `getURL → uRL`), and grammar §4.3 updated to match. The
helper location is reflected in the files-map.

---

## New findings introduced by the revision

### NIT-1 — Broken sentence in the multi-top-level-element root rule

Where: Phase 3 §2 ("A per-instance root discriminator"). The sentence "for a
structure with multiple top-level siblings, the emitter wraps the instance body
is **not** done (no speculative wrappers) — instead `data-adx-i` is stamped on
**each** top-level owned element" is grammatically garbled (a merge of "the
emitter wraps the instance body" and "wrapping is not done"). The intended rule
is clear and correct (no wrapper; stamp `data-adx-i` on each top-level element),
but the prose should be fixed before it ships into the grammar/architecture docs.

Concrete fix: reword to e.g. "for a structure with multiple top-level siblings,
the emitter does **not** add a wrapper element (no speculative wrappers); instead
it stamps `data-adx-i` on **each** top-level owned element of the instance."

### NIT-2 — Glue code sketch uses `querySelector` for the instance root, but the multi-root rule says the root query returns a NodeList

Where: Phase 3 §2 vs §3. §2 says for a multi-top-level-element instance "the
glue's root query returns a NodeList that the instance treats as its roots",
while the §3 code sketch locates the root with
`document.querySelector('[data-adx-c="SCOPE"][data-adx-i="i<k>"]')` (single
element) and scopes `byHook`/`rerender`/`emit` to that one `root`. For the
common single-root component (the fixture's `user-card`) this is fully correct;
only the explicitly "supported but discouraged" multi-root case is
under-specified (the sketch would bind only the first top-level element, and
`emit`/`rerender` would ignore siblings). Not blocking because the per-instance
mechanism is correct for the dominant single-root case the hard constraint
targets, and multi-root composition is already flagged as discouraged.

Concrete fix: either (a) state that a composed instance MUST have a single
top-level root element (make multi-root a fatal "component used in composition
must have a single root" error), or (b) make the §3 sketch use
`querySelectorAll` for the instance roots and iterate, so `byHook`/`rerender`/
`emit` cover every top-level element. Pick one so §2 and §3 agree.

---

## Verified assumptions (re-checked against source, correct)

1. `src/codegen/glue.ts`: single `root = querySelector('[data-adx-c=SCOPE]')`,
   single `state = setup(props)`, free `emit` closes over that one root, props
   baked from manifest defaults with a `globalThis.__ADX_PROPS__` override — the
   design's HIGH-1/HIGH-2/NIT-1 premises are all accurate.
2. `src/codegen/html.ts`: `data-adx-b` emitted only when
   `bindings.length>0 || events.length>0`; `bindingId` is two-part
   `${scope}-${index}`; `bindingCount` resets to 0 per `emitHtml`; interpolated
   text lives in child `TextNode`s; `emitSlot` emits
   `<slot data-adx-slot=… data-adx-c=…>`; custom tags are emitted verbatim — all
   as the design states (MEDIUM-2/MEDIUM-4/MEDIUM-5 premises correct).
3. `src/codegen/scope.ts`: `scopeId` hashes `name\u0000locationPath` verbatim
   (no normalization); `bindingId(scope,index)` is two-part. The design's NIT-2
   (normalization is caller work) and the additive `instanceBindingId` plan are
   consistent.
4. `src/compile.ts`: build scope is `{ state: defaultProps, props: defaultProps }`,
   `setup()` is never executed, `wrapDocument` hardcodes `<html lang="en">` +
   `<link rel="canonical" href="/">` and emits schema-gated JSON-LD
   `{@type: seo.schema, name: manifest.name}` — the Phase 1 "M1 does not run
   setup" premise, NIT-2 single-component SEO deferral, and NIT-3 JSON-LD shape
   are all accurate.
5. `src/behavior/scan.ts`: `EXPORT_RE` matches
   `export (async)? function|function*|const|let|var <name>`; `get[A-Z]`→computed,
   `on[A-Z]`→events, sorted — the design's "strip only the leading `export `
   keyword", "invoke only setup + sorted get*", and "export const setup = …
   survives the strip" plans are all compatible with the real regex.
6. `src/expr/evaluate.ts`: a bare ident resolves loop→state→props→computed; a
   computed value may be a thunk (called when a function); member access resolves
   the base then walks `.property`. The single-state/computed-thunk contract and
   the `rootIdent`-of-member-chain freeze rule match the resolver's behavior.
7. `src/structure/ast.ts`: `Expr` is `{kind:"ident",name}` /
   `{kind:"member",object,property}` — the design's `SerExpr`
   (`{ident}`/`{member,prop}`) is a faithful 1:1 lowering; `rootIdent` unwraps
   correctly.
8. `src/structure/parser.ts`: `parseSlot` takes the first *bare* attr as the slot
   name, so `<slot actions />` parses and `<slot name="actions"/>` throws
   `Slot may only carry a name and class shorthands` (the valued `name` attr
   falls to `extraAttrs`). `splitAttributes` reads a name "up to whitespace or
   `=`" with no charset restriction, and `PROP_NAME` only guards `:`/`@`, so
   `<template slot="actions">` and `<template #actions>` both parse with zero
   tokenizer/parser change — the design's HIGH-3/MEDIUM-1 corrections are
   factually right.
9. `src/codegen/context.ts`: `CodegenContext` currently carries scopeId/scope/
   tokens/behavior/manifest and no `mergedProps`/`INSTANCES` — the design's
   additive extensions are new work as the files-map states.
10. A `package.json` exists at the worktree root, so the pinned `repoRoot`
    (nearest ancestor with `package.json`) resolves deterministically — the NIT-2
    reproducibility guarantee holds.

## Unverified / wrong assumptions

None. Every M1-source claim the revision makes was checked and found accurate; no
new contradiction of a locked decision or of the per-instance constraint was
introduced. The two findings above are a prose defect (NIT-1) and an
edge-case/under-specification for a discouraged multi-root case (NIT-2), neither
of which blocks.

## Locked-decision / constraint compliance

No finding asks to change a locked decision, and the per-instance hydration model
is applied, not re-litigated. The design respects: sandboxed `vm` `setup()`
execution (honestly documenting `vm` is not a hard boundary — Risk 1); JSON page
manifest; all six phases in one milestone; SEO static-first (zero `{{`,
hydration-only glue, build-time computed freeze preventing blanked crawled
content); the verbatim `[ADX]` error format; and the benchmark honesty rule
naming the exact superseded "65-85%" headline. HIGH-1/HIGH-2/MEDIUM-3 are closed
*by conforming to* the per-instance model (per-instance `INSTANCES` loop +
`data-adx-i` discriminator + parent-owned projected nodes), exactly as the hard
constraint requires.
