# Patterns

Three patterns are SHIPPED via `adx pattern <name>` — `form`, `table`, and
`modal` (see [Shipped patterns](#shipped-patterns) below). Everything else on
this page is a future DESIGN PROPOSAL, not a runnable API: `@adx/patterns` is not
available, behavior imports are unsupported, and the `<field>`/`<modal>`/`:open`
tags and `#cell`/`#item` template slots shown in the proposals are NOT accepted
by the current compiler. Use the [AI Frontend Guide](./agent-reference.md) for
supported syntax and the [roadmap](./roadmap.md) for planned work.

## Shipped patterns

Scaffold with `adx pattern <name>` (run `adx pattern --list` for the catalog).
Each drops a four-file component under `<targetDir>/<name>/` (`targetDir` defaults
to the name) that builds and checks with no `--data`, uses design tokens only,
and meets the accessibility baseline. These use ONLY supported ADX syntax
(`.class`, `:prop`, `@event`, `{{interp}}`, `:if`/`:for`).

**form** — a semantic form with a labelled input, hint, and a live error region.
The error text is a single bare computed `{{nameError}}`; the `@submit` handler
keeps it live, so it re-evaluates via `getNameError` on submit.
```adx
<form .form @submit="onSubmit">
  <label .label for="form-name">{{label}}</label>
  <p .hint id="form-name-hint">{{hint}}</p>
  <input .input id="form-name" type="text" name="name" aria-describedby="form-name-hint form-name-error">
  <p .error id="form-name-error" role="status" aria-live="polite">{{nameError}}</p>
  <button .submit type="submit">{{submitLabel}}</button>
</form>
```

**table** — an accessible data table. Rows `:for`-unroll from a defaulted array
prop at build time (frozen — a static data table has no runtime row reactivity).
```adx
<table .table>
  <caption .caption>{{caption}}</caption>
  <thead>
    <tr>
      <th scope="col">Name</th>
      <th scope="col">Role</th>
    </tr>
  </thead>
  <tbody>
    <tr :for="row in rows">
      <td>{{row.name}}</td>
      <td>{{row.role}}</td>
    </tr>
  </tbody>
</table>
```

**modal** — an accessible dialog with a labelled title and a keyboard close
button. `onClose` emits `close`. HONEST LIMIT: `:if` open/close STRUCTURAL
toggling is not a runtime behavior in this release — the pattern ships correct
static dialog semantics and the close handler, and a host controls mounting.
```adx
<div .modal role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 .title id="modal-title">{{title}}</h2>
  <p .message>{{message}}</p>
  <button .close type="button" aria-label="Close dialog" @click="onClose">{{closeLabel}}</button>
</div>
```

## Design proposals (not implemented)

Everything below is a future design proposal, not a runnable API. The current
compiler does not implement these pattern contracts.

Proposed usage: import a pattern from `@adx/patterns`, use it as a base, and
extend it as needed. Behavior imports are not supported by the current compiler.

## Layout Patterns

**Stack** (vertical spacing):
```adx
<div .stack :gap="space-4">
  <div>Item 1</div>
  <div>Item 2</div>
</div>
```

**Grid** (responsive columns):
```adx
<div .grid :cols="3" :gap="space-4">
  <div>Card 1</div>
  <div>Card 2</div>
  <div>Card 3</div>
</div>
```

**Sidebar** (main + sidebar layout):
```adx
<div .sidebar :sideWidth="300px">
  <aside>Sidebar</aside>
  <main>Content</main>
</div>
```

**Cluster** (wrapped horizontal):
```adx
<div .cluster :gap="space-2">
  <span>Tag 1</span>
  <span>Tag 2</span>
  <span>Tag 3</span>
</div>
```

## Form Patterns (proposals)

NOTE: a working form ships via `adx pattern form` (see
[Shipped patterns](#shipped-patterns)). The `<field>` tag below is a PROPOSAL and
is NOT accepted by the compiler; the shipped form uses plain
`<label for>`+`<input id>` with an `aria-live` error region instead.

**Form** (proposed `<field>` wrapper):
```adx
<form .form @submit="onSubmit">
  <field :label="Name" :error="errors.name">
    <input :value="name" @input="onNameChange">
  </field>
  <button type="submit">Submit</button>
</form>
```

**Field** (proposed label + input + error wrapper):
```adx
<field :label="Email" :required="true" :error="emailError">
  <input type="email" :value="email">
</field>
```

## Data Patterns (proposals)

NOTE: a working table ships via `adx pattern table` (see
[Shipped patterns](#shipped-patterns)). The `:data`/`:columns` props and the
`#cell` template slot below are PROPOSALS and are NOT accepted by the compiler;
the shipped table uses `<caption>`, `<th scope="col">`, and a `:for` row loop.

**Table** (proposed `:data`/`#cell` form):
```adx
<table .table :data="rows" :columns="cols">
  <template #cell="{ col, row }">
    {{row[col.key]}}
  </template>
</table>
```

**List**:
```adx
<list :items="users" :keyField="id">
  <template #item="{ item }">
    <div>{{item.name}}</div>
  </template>
</list>
```

## Feedback Patterns

**Toast** (notification):
```js
import { toast } from '@adx/patterns'

toast.success('Saved!', { duration: 3000 })
toast.error('Failed', { duration: 5000 })
toast.info('Info message')
```

**Modal** (proposed `<modal :open>` form — NOT implemented): a working modal
ships via `adx pattern modal` (see [Shipped patterns](#shipped-patterns)). The
`<modal>` tag and `:open` toggling below are PROPOSALS and are NOT accepted by
the compiler; the shipped modal is a `role="dialog"` container with a static
open state and an `onClose` emit (a host controls mounting).
```adx
<modal :open="isOpen" @close="onClose">
  <h2>Title</h2>
  <p>Content</p>
  <button @click="onClose">Close</button>
</modal>
```

**Alert**:
```adx
<alert :type="success|warning|error|info">
  Message text
</alert>
```

**Loader**:
```adx
<loader :active="isLoading" :message="Loading...">
  <!-- Content shown when not loading -->
</loader>
```

## Navigation Patterns

**Nav**:
```adx
<nav .nav :items="navItems" :active="currentPath">
  <template #item="{ item }">
    <a :href="item.path">{{item.label}}</a>
  </template>
</nav>
```

**Tabs**:
```adx
<tabs :items="tabs" :active="activeTab" @change="onTabChange">
  <template #panel="{ item }">
    <div>{{item.content}}</div>
  </template>
</tabs>
```

**Breadcrumb**:
```adx
<breadcrumb :items="path">
  <template #item="{ item, isLast }">
    <a v-if="!isLast" :href="item.path">{{item.label}}</a>
    <span v-else>{{item.label}}</span>
  </template>
</breadcrumb>
```

**Pagination**:
```adx
<pagination :total="100" :perPage="10" :current="page" @change="onPageChange" />
```