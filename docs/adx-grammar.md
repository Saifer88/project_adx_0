# ADX Structure Grammar (`.structure.adx`)

Status: **spec for the Milestone 1 parser**. This pins the exact `.structure.adx`
syntax the compiler parses into an AST. Behavior (`.behavior.adx.js`) and style
(`.style.adx.css`) have their own rules; this file covers structure only.

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
does not distinguish them — resolution of custom components is a later milestone.

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
enclosing `:for` elements first, then the `setup()` state object, then
`props`. An identifier that resolves nowhere evaluates to `undefined` and, for
`:if`, is treated as falsy; for interpolation it emits the empty string. The
build does not throw on unknown identifiers in M1 (keeps authoring forgiving),
but `adx check` MAY report them as warnings.

## 5. Expressions (build-time)

M1 supports a deliberately small expression grammar — enough for the documented
examples, no more:

- Identifiers: `name`, `items`.
- Member access: `item.id`, `user.profile.name`.
- Indexing is **not** supported in M1 (`a[b]`), nor function calls, nor
  arithmetic/logical operators. `getXxx(state)` computed values are referenced by
  their **bare computed name** (`displayName` resolves to `getDisplayName`'s
  result) — see behavior rules. This keeps the evaluator a safe property walker,
  not a JS `eval`.
- String templates in attribute values interleave literal text with the above
  expressions via `{{ }}`.

Anything outside this grammar is an error at parse time:
`[ADX] structure.adx:<line> - Unsupported expression "<raw>"`.

## 6. Slots — `<slot name />`

- `<slot />` — the default slot.
- `<slot actions />` — a **named** slot `actions`. The name is the first bare
  token after `slot`.
- Slots are always self-closing; `<slot>...</slot>` is an error.
- A slot element MAY also carry class shorthands which become the wrapper's
  classes when the compiler emits slot markup (M1 emits a `<slot>` placeholder
  element with a `data-adx-slot="<name>"` hook; actual content projection across
  components is a later milestone, but the hook and name must be parsed and
  recorded now).
- Duplicate slot names in one component are an error:
  `[ADX] structure.adx:<line> - Duplicate slot "actions"`.

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
and a `data-adx-slot="actions"` placeholder.

---

*Grammar is the parser's contract. Keep it in sync with `agent-reference.md`.*
