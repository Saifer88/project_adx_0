# ADX Structure Grammar (`.structure.adx`)

Status: **spec for the shipped parser (through Milestone 2)**. This pins the exact
`.structure.adx` syntax the compiler parses into an AST. Behavior
(`.behavior.adx.js`) and style (`.style.adx.css`) have their own rules; this file
covers structure only. The parser itself is unchanged since M1 — M2 added
component composition and slot projection in the HTML emitter (§11), not in the
grammar, so every construct below already parses.

Design goals (in order): minimal token cost, trivial for an AI to read/emit,
unambiguous to parse, and SEO-safe (resolves to complete static HTML at build time).

## 1. Lexical structure

A `.structure.adx` file is a sequence of **nodes**. A node is one of:

- **Element** — `<tag ...attrs> children </tag>` or self-closing `<tag ... />`.
- **Slot** — `<slot name />` or `<slot />` (default slot). Always self-closing.
- **Text** — any run of characters between tags, may contain `{{ ... }}`.

Whitespace between tags is insignificant except inside text runs. The parser
trims leading/trailing whitespace of each text run and collapses it to the
emitted HTML verbatim otherwise (no minification in M1).

Comments: `<!-- ... -->` are recognized and dropped (not emitted).

Tag names: `[a-zA-Z][a-zA-Z0-9-]*`. Lowercase HTML elements (`div`, `h2`, `img`,
`article`, …) and custom component tags (`user-card`) are both valid; the parser
does not distinguish them. Resolution of custom component tags against
`manifest.deps` happens later in the pipeline (the HTML emitter, not the parser)
— see §11 Component composition.

## 2. Attributes

Inside an opening tag, after the tag name, comes a whitespace-separated list of
attributes. Four attribute forms exist; order among them is free.

### 2.1 Class shorthand — `.name`

`.card` adds class `card`. Repeatable: `.card .wide` → `class="card wide"`.
Class names: `[a-zA-Z][a-zA-Z0-9_-]*`.

### 2.2 Property binding — `:prop="expr"`

`:src="avatar"` binds attribute `src` to the expression `avatar`. The quoted
value is an **expression** evaluated against component state at build time (see
§5). Prop names: `[a-zA-Z][a-zA-Z0-9-]*`.

Reserved `:`-prefixed names are **directives**, not property bindings:
`:if`, `:else`, `:for`, `:key`. See §4. Everything else `:x` is a binding.

### 2.3 Event binding — `@event="handler"`

`@click="onClick"` wires DOM event `click` to the behavior export `onClick`.
The value must be a bare identifier naming a `behavior.adx.js` export (an
`on<Event>` function). It is NOT an expression. Event names: `[a-zA-Z][a-zA-Z0-9-]*`.

### 2.4 Plain attribute — `name` or `name="literal"`

`type="email"` or boolean `required`. The value (if present) is a **string
literal**, emitted verbatim — not an expression. `name` with no value emits a
boolean attribute.

### 2.5 Attribute vs shorthand precedence (classes)

If both a shorthand class and a literal `class="..."` appear on one element, the
parser **merges** them: literal classes first, then shorthand classes, space-
joined, deduplicated left-to-right. Example: `<div class="a b" .b .c>` →
`class="a b c"`. This is deterministic; the implementer must not reorder beyond
this rule.

If the same `:prop` or plain attribute is specified twice on one element, that is
an error: `[ADX] structure.adx:<line> - Duplicate attribute ":src"`.

## 3. Interpolation — `{{ expr }}`

`{{ expr }}` appears in **text content** and inside **quoted attribute/binding
values**.

- In text: `<h2>{{name}}</h2>` → the text node holds one interpolation expr.
- Inside an attribute value: `:alt="user {{name}}"` and `title="Hi {{name}}"`
  are both allowed — the value is a template with zero or more `{{ }}` holes
  interleaved with literal text. A `:prop` whose entire value is a single
  `{{expr}}` is equivalent to `:prop="expr"`.

Whitespace inside `{{ }}` is trimmed. Nested `{{ }}` is not allowed. An
unterminated `{{` is an error: `[ADX] structure.adx:<line> - Unterminated interpolation`.

Expressions are resolved at **build time** against the state object returned by
`setup(props)` (plus loop/scope variables, §4.3). The emitted HTML contains the
resolved string — never the `{{ }}` source. This is the SEO contract.

## 4. Control-flow directives

Directives are attributes on an element that control whether/how it renders. They
are evaluated at build time to produce static HTML; the hydration glue re-evaluates
them only when a handler explicitly re-runs the affected binding (M1 keeps this
minimal — see architecture Runtime).

### 4.1 `:if` / `:else`

- `:if="expr"` — element and subtree render only when `expr` is truthy.
- `:else` — valueless. The element must be the **immediately following sibling**
  of an `:if` element (ignoring whitespace/comment nodes). It renders when the
  paired `:if` was falsy.
- An `:else` with no preceding `:if` sibling is an error:
  `[ADX] structure.adx:<line> - ":else" without matching ":if"`.
- `:if` and `:else` on the same element is an error.
- There is no `:else-if` in M1.

### 4.2 `:for` — iteration

- `:for="item in items"` — repeats the element once per entry of `items`.
- `:for="(item, i) in items"` — second binding is the zero-based index.
- The iterable expression (`items`) is resolved against the current scope.
- `item` (and `i`) are added to the scope for this element and its subtree only.
- `:key="expr"` SHOULD accompany `:for`; `expr` is evaluated in the loop scope
  (e.g. `item.id`). M1 does not require uniqueness enforcement but records the key
  for hydration. A `:key` without `:for` on the same element is a warning, not an
  error, in M1.
- Invalid syntax (missing `in`, bad binding list) is an error:
  `[ADX] structure.adx:<line> - Invalid :for expression "<raw>" (expected "item in items")`.

### 4.3 Directive combination and scope

Multiple directives may appear on one element. Evaluation order is fixed and
deterministic: **`:for` outermost, then `:if`, then bindings/interpolation**.
That is, the element is iterated first; each iteration is then conditionally
rendered; surviving iterations resolve their bindings in the loop scope.
`:if` + `:else` cannot both sit on a `:for` element paired across iterations —
`:else` pairs by sibling at the source level, not per iteration.

Scope resolution for an expression walks inner-to-outer: loop variables of
enclosing `:for` elements first, then the `setup()` state object, then `props`,
then **computed values** (keyed by their bare name — see below). An identifier
that resolves nowhere evaluates to `undefined` and, for `:if`, is treated as
falsy; for interpolation it emits the empty string. The build does not throw on
unknown identifiers (keeps authoring forgiving), but `adx check` MAY report them
as warnings.

**`get*` → bare computed-key lowering (pinned, byte-for-byte).** A `behavior`
export named `get<Name>` is exposed to expressions under a **bare key** derived by
exactly this rule: strip the leading `get` (always three characters — the scanner
only classifies `get` followed by an uppercase letter), then **lowercase only the
first remaining character** and leave every subsequent character untouched.

```
getDisplayName → displayName
getURL         → uRL        # acronym case: only char 0 is lowercased
getX           → x
```

This is a deliberate single-char lowering, **not** a camelCase smart-split, so
the acronym case is `getURL → uRL` (the rest of `URL` is preserved verbatim). The
same helper (`bareComputedKey`) that builds the build-time computed scope also
builds the reactivity freeze set, so the two agree for every input. In an
expression you therefore write `{{displayName}}`, never `{{getDisplayName}}`.

## 5. Expressions (build-time)

M1 supports a deliberately small expression grammar — enough for the documented
examples, no more:

- Identifiers: `name`, `items`.
- Member access: `item.id`, `user.profile.name`.
- Indexing is **not** supported in M1 (`a[b]`), nor function calls, nor
  arithmetic/logical operators. `get*(state)` computed values are referenced by
  their **bare computed name** (`displayName` resolves to `getDisplayName`'s
  result; `uRL` to `getURL`'s — the exact lowering is pinned in §4.3). This keeps
  the evaluator a safe property walker, not a JS `eval`.
- String templates in attribute values interleave literal text with the above
  expressions via `{{ }}`.

Anything outside this grammar is an error at parse time:
`[ADX] structure.adx:<line> - Unsupported expression "<raw>"`.

## 6. Slots — declaration side (`<slot name />`)

A slot is the **declaration** of a hole a parent may fill. The projection side
(how a parent fills it) is §11.2.

- `<slot />` — the default slot.
- `<slot actions />` — a **named** slot `actions`. The name is the first **bare**
  token after `slot`.
- `<slot name="actions" />` is **NOT valid** — `name="actions"` is a *valued*
  attribute, and a slot may only carry a bare name plus class shorthands, so this
  errors: `[ADX] structure.adx:<line> - Slot may only carry a name and class shorthands`.
  Use `<slot actions />`.
- Slots are always self-closing; `<slot>...</slot>` is an error.
- A slot element MAY also carry class shorthands.
- Duplicate slot names in one component are an error:
  `[ADX] structure.adx:<line> - Duplicate slot "actions"`.

**Build-time placeholder (standalone compilation only).** When a component is
compiled on its own (`adx build <dir>`), each `<slot>` emits a
`<slot data-adx-slot="<name>" …></slot>` placeholder in the HTML — there is no
parent to fill it. When the component is **composed** (resolved as a child under a
parent via §11), the emitter replaces each slot position with the parent's
projected content and the `data-adx-slot` placeholder does **not** appear. Slot
projection is entirely a **build-time** operation: the resolved content is baked
into the static HTML, so a crawler sees it with no JavaScript.

## 7. Nesting and well-formedness

- Every non-self-closing element must have a matching close tag. Mismatch is an
  error: `[ADX] structure.adx:<line> - Expected </div>, found </span>`.
- Self-closing form `<tag ... />` is allowed for any element; void HTML elements
  (`img`, `input`, `br`, `hr`, `meta`, `link`, …) MAY omit the slash and are
  treated as self-closing automatically.
- A file may have multiple top-level nodes (fragment root is allowed). The
  compiler wraps them per the HTML emitter rules; it does not force a single root.

## 8. AST shape (parser output)

The parser produces a plain-object tree. One node kind per object, discriminated
by `kind`. Positions carry `line` (1-based) for error messages.

```
Node =
  | { kind: "element", tag: string, line: number,
      classes: string[],                 // merged, deduped (see §2.5)
      bindings: { name: string, expr: Expr }[],      // :prop
      attrs: { name: string, value: string | null }[], // plain
      events: { name: string, handler: string }[],   // @event
      directives: {
        if?: Expr, else?: true,
        for?: { item: string, index?: string, iterable: Expr },
        key?: Expr
      },
      children: Node[], selfClosing: boolean }
  | { kind: "slot", name: string, classes: string[], line: number }
  | { kind: "text", line: number, parts: TextPart[] }   // see below

TextPart = { lit: string } | { expr: Expr }
Expr     = { kind: "ident", name: string }
         | { kind: "member", object: Expr, property: string }
```

Interpolation inside an attribute value is stored on the binding as an `Expr`
when the whole value is one hole, or the parser lowers a mixed template into a
synthesized concatenation represented as a `TextPart[]` carried on the binding
(implementer's choice, but it MUST round-trip to the correct emitted string).

## 8a. Hydration attributes the emitter stamps

The parser produces the AST above; the HTML emitter then stamps hydration
attributes onto the output. These are **not** authored in `.structure.adx` — they
are documented here because they are part of the structural contract the glue
relies on:

- `data-adx-c="<scopeId>"` on every element a component owns. The `scopeId`
  groups a component's CSS and is **shared** by all instances of that component on
  a page (it is the CSS-isolation key).
- `data-adx-i="i<ordinal>"` on each **instance root**. Because `data-adx-c` is
  shared, this per-instance ordinal is what distinguishes one instance of a
  component from another when the same component appears multiple times on a page.
  The pair `[data-adx-c="<scope>"][data-adx-i="i<k>"]` uniquely selects instance
  `k`'s root.
- `data-adx-b="<scopeId>-i<ordinal>-<n>"` on each bound/evented/interpolated node
  — the **three-part hook id**: scope, instance ordinal, then the per-instance
  node index `n`. A standalone single-component build has exactly one instance, so
  its ids are `<scope>-i0-<n>`.

## 9. Error format (must match exactly)

All structure errors use: `[ADX] structure.adx:<line> - <message>`.
`<line>` is 1-based. Messages are the ones named inline above. The emitter and
other stages follow the same `[ADX] <file>:<line> - <message>` shape (manifest
errors omit the line: `[ADX] manifest.json - <message>`).

## 10. Worked example

Source (`structure.adx`):

```adx
<article .card @click="onClick">
  <img :src="avatar" :alt="name" .avatar>
  <div .content>
    <h2 .name>{{name}}</h2>
    <p .role>{{role}}</p>
    <p :if="bio" .bio>{{bio}}</p>
  </div>
  <ul :if="tags">
    <li :for="(t, i) in tags" :key="t.id">{{t.label}}</li>
  </ul>
  <slot actions />
</article>
```

Parses to an `element` root `article` with class `card`, one `@click` event, and
children: a self-closing `img` (two bindings, one class), a `content` div, a
conditional `ul` whose single `li` child carries a `:for` with `item="t"`,
`index="i"`, `key = member(t,"id")`, and a named `slot` `actions`. At build time,
with state `{ name:"Ada", role:"Eng", bio:"", avatar:"/a.png", tags:[...] }`, the
emitter produces complete HTML with `{{...}}` resolved, the `:if="bio"` paragraph
omitted (empty string is falsy only if explicitly empty — note: `""` is falsy),
and (in a standalone build) a `data-adx-slot="actions"` placeholder.

## 11. Component composition

A component embeds another by using the dependency's tag. Resolution and
projection happen in the HTML emitter at build time — the grammar/parser is
unchanged.

### 11.1 Custom-tag resolution against `manifest.deps`

When the emitter meets an element whose tag is **not** a known HTML element and
is not `slot`, it resolves the tag against the using component's `manifest.deps`:

- A dep-resolution table is built once per component. For each entry in
  `manifest.deps` (a relative path to a component directory, resolved relative to
  the using component's own directory), the dep's `manifest.json` is loaded and
  indexed by two keys: the kebab-case of its `manifest.name`, and the dep
  directory's basename. A tag matching either key resolves to that dep.
- A tag that is neither a known HTML element nor a resolvable dep is a fatal
  error: `[ADX] structure.adx:<line> - Unknown component "<tag>" (not an HTML element; add to manifest deps)`.
- A `manifest.deps` entry that is missing or does not point at a component
  directory: `[ADX] manifest.json - Dependency not found: "<dep>"`.
- A dependency cycle (a component that transitively depends on itself) is a fatal
  error naming the chain: `[ADX] structure.adx:<line> - Dependency cycle: a -> b -> a`.

### 11.2 Prop passing and slot projection (parent side)

A parent passes props and projects content:

```adx
<user-card :name="author.name" role="Founder">
  <template slot="actions">
    <button @click="onFollow">Follow</button>
  </template>
</user-card>
```

- `:prop="expr"` bindings and plain `attr="literal"` attributes on the custom tag
  are evaluated **against the parent's scope** to produce the child's props, then
  the child is required-prop-validated and compiled recursively with them.
- `@event="handler"` on a custom tag wires the parent's handler to the child's
  emitted event (the child root dispatches a bubbling `CustomEvent`).
- **Named-slot projection** uses `<template slot="name">…</template>`. The
  canonical projection form is the plain attribute `slot="name"`.
- **Default-slot content** is any direct child that is not a `<template slot="…">`
  — a bare `<template>` (no `slot` attribute) or any non-`template` element
  projects into the child's default `<slot />`. Whitespace-only text between
  templates is ignored. A self-closing custom element (`<user-card … />`) projects
  nothing, so the child's slots render empty.
- Projection errors (both fatal): two templates targeting the same named slot →
  `[ADX] structure.adx:<line> - Duplicate slot content for "actions"` (line = the
  second template); projecting into a slot the child did not declare →
  `[ADX] structure.adx:<line> - Component "<tag>" has no slot "actions"`.

`#name` is reserved **planned sugar** for `slot="name"`. Note it is already
**parseable today** — `splitAttributes` imposes no charset on plain attribute
names, so `<template #actions>` tokenizes and parses right now; M2 simply picks
`slot="name"` as the single canonical spelling and does not yet wire `#name`. No
parser change is required to add it later.

### 11.3 Ownership of projected nodes

Projected slot content is **parent-owned** for CSS and hydration: it carries the
**parent's** `data-adx-c` (scope), the **parent's** `data-adx-i` instance ordinal,
and the parent's instance-scoped hook ids. Only its DOM *position* is inside the
child. So `{{parentState}}` inside projected content resolves against the parent's
state and any `@event` there is wired by the parent's glue; the child's glue never
touches projected nodes.

### 11.4 Per-instance identity

When a component appears N times, each occurrence is an independent instance: its
own merged props, its own `setup(props) → state`, its own root, and its own
event/`emit`/patch routing. The emitter stamps a distinct `data-adx-i="i<ordinal>"`
on each instance root and emits instance-scoped three-part hook ids
`<scope>-i<ordinal>-<n>` (§8a). The CSS is emitted once per component (shared
`data-adx-c`); the body is emitted N times.

---

*Grammar is the parser's contract. Keep it in sync with `agent-reference.md`.*
