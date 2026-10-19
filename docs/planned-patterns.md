# Planned Patterns (Not Implemented)

These are future design proposals, not runnable APIs. `@adx/patterns` is not
available, and the current compiler does not implement these pattern contracts.
Use the [AI Frontend Guide](./agent-reference.md) for supported syntax and the
[roadmap](./roadmap.md) for planned work.

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

## Form Patterns

**Form**:
```adx
<form .form @submit="onSubmit">
  <field :label="Name" :error="errors.name">
    <input :value="name" @input="onNameChange">
  </field>
  <button type="submit">Submit</button>
</form>
```

**Field** (label + input + error):
```adx
<field :label="Email" :required="true" :error="emailError">
  <input type="email" :value="email">
</field>
```

## Data Patterns

**Table**:
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

**Modal**:
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