/**
 * Built-in pattern catalog for `adx pattern <name>`.
 *
 * Each pattern is a data entry (a key in {@link PATTERNS}) carrying the four
 * `.adx` files for one accessible-by-default component. Adding a pattern is a
 * DATA edit — a new key here — and the catalog-iterating test proves every
 * entry builds/checks clean with no `--data`. Scaffolding reuses FEAT-002's
 * conflict-safe {@link writeFileSet}, so a pattern refuses to overwrite and
 * writes nothing on conflict, exactly like `adx init` / `adx create`.
 *
 * Quality bar (identical to the `hello-card`/`create` templates):
 *   - every prop defaults, so each pattern builds with no `--data`;
 *   - CSS is `@use tokens;` with token-only values (no hardcoded themed hex);
 *   - interactive controls carry a token-sized touch target
 *     (`tokens.space-12` = 48px, at/above the 44px WCAG-AA baseline);
 *   - semantics are accessible by default (labels + inline error region; a
 *     dialog role + accessible name; scoped table headers + a caption).
 *
 * Supported ADX syntax ONLY: these patterns emit the syntax the real compiler
 * accepts (`.class`, `:prop`, `@event`, `{{interp}}`, `:if`/`:for`). They do
 * NOT use the unbuilt `<field>`/`@adx/patterns`/`:open` proposals.
 */

import { resolve } from "node:path";
import { writeFileSet } from "./scaffold.js";

/** One catalog entry: a name, a one-line description, and its four `.adx`
 * files (flat, relative to the target dir — no `<name>/` prefix). */
export interface PatternEntry {
  name: string;
  description: string;
  files: { path: string; contents: string }[];
}

/* -------------------------------------------------------------------------- */
/* form                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * An accessible form: a semantic `<form @submit="onSubmit">` with a
 * `<label for>`+`<input id>` pair, per-field hint text, and an
 * `aria-live="polite"` inline error region whose TEXT is a single bare computed
 * `{{nameError}}` (from `getNameError(state)`) referenced by the input's
 * `aria-describedby`. The `@submit="onSubmit"` binding is load-bearing: it keeps
 * FEAT-001's `hasWiredEvent` gate true, so the `computedText` update for the
 * error region is retained and `getNameError` is imported into the glue — the
 * error text live-patches when `onSubmit` sets the error state.
 */
const FORM: PatternEntry = {
  name: "form",
  description: "Accessible form with labelled input, hint, and a live error region.",
  files: [
    {
      path: "manifest.json",
      contents: `{
  "name": "Form",
  "version": "1.0.0",
  "props": {
    "legend": { "type": "string", "default": "Contact" },
    "label": { "type": "string", "default": "Name" },
    "hint": { "type": "string", "default": "Enter your full name." },
    "submitLabel": { "type": "string", "default": "Submit" }
  },
  "emits": ["submit"],
  "slots": []
}
`,
    },
    {
      path: "structure.adx",
      contents: `<form .form @submit="onSubmit">
  <label .label for="form-name">{{label}}</label>
  <p .hint id="form-name-hint">{{hint}}</p>
  <input .input id="form-name" type="text" name="name" aria-describedby="form-name-hint form-name-error">
  <p .error id="form-name-error" role="status" aria-live="polite">{{nameError}}</p>
  <button .submit type="submit">{{submitLabel}}</button>
</form>
`,
    },
    {
      path: "behavior.adx.js",
      contents: `export function setup(props) {
  return {
    label: props.label,
    hint: props.hint,
    submitLabel: props.submitLabel,
    name: '',
    errors: {}
  }
}

export function getNameError(state) {
  return state.errors && state.errors.name ? state.errors.name : ''
}

export function onSubmit(state, event) {
  if (event && typeof event.preventDefault === 'function') {
    event.preventDefault()
  }
  if (!state.name) {
    state.errors = { name: 'Name is required.' }
  } else {
    state.errors = {}
  }
}
`,
    },
    {
      path: "style.adx.css",
      contents: `@use tokens;

.form {
  display: flex;
  flex-direction: column;
  gap: tokens.space-2;
  pad: tokens.space-6;
  bg: tokens.surface-0;
  radius: tokens.radius-lg;
  shadow: tokens.shadow-md;
}

.label {
  size: tokens.text-base;
  weight: tokens.weight-medium;
  color: tokens.text-1;
}

.hint {
  margin: 0;
  size: tokens.text-sm;
  color: tokens.text-2;
}

.input {
  min-height: tokens.space-12;
  pad: tokens.space-2 tokens.space-3;
  bg: tokens.surface-0;
  color: tokens.text-1;
  border: 1px solid tokens.border;
  radius: tokens.radius-md;
  size: tokens.text-base;
}

.error {
  margin: 0;
  size: tokens.text-sm;
  weight: tokens.weight-medium;
  color: tokens.error;
}

.submit {
  align-self: flex-start;
  /* Token-sized min-height keeps the control at/above the 44px touch target
     the UX baseline requires (space-12 = 48px). */
  min-height: tokens.space-12;
  pad: tokens.space-2 tokens.space-4;
  bg: tokens.primary;
  color: tokens.surface-0;
  radius: tokens.radius-md;
  size: tokens.text-base;
  weight: tokens.weight-medium;
  border: none;
  cursor: pointer;
}

.submit:hover {
  bg: tokens.secondary;
}

.submit:active {
  opacity: 0.85;
}
`,
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* table                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * An accessible data table: a `<table>` with a `<caption>` accessible name,
 * `<thead>`/`<tbody>`, and `<th scope="col">` column headers. Rows render via
 * `:for` over a defaulted array prop — build-time unrolled and frozen, which is
 * correct for a static data table (no runtime row reactivity). Token-styled.
 */
const TABLE: PatternEntry = {
  name: "table",
  description: "Accessible data table with a caption and scoped column headers.",
  files: [
    {
      path: "manifest.json",
      contents: `{
  "name": "Table",
  "version": "1.0.0",
  "props": {
    "caption": { "type": "string", "default": "Team members" },
    "rows": {
      "type": "array",
      "default": [
        { "name": "Ada Lovelace", "role": "Engineer" },
        { "name": "Grace Hopper", "role": "Admiral" }
      ]
    }
  },
  "emits": [],
  "slots": []
}
`,
    },
    {
      path: "structure.adx",
      contents: `<table .table>
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
`,
    },
    {
      path: "behavior.adx.js",
      contents: `export function setup(props) {
  return {
    caption: props.caption,
    rows: props.rows
  }
}
`,
    },
    {
      path: "style.adx.css",
      contents: `@use tokens;

.table {
  width: 100%;
  border-collapse: collapse;
  bg: tokens.surface-0;
  color: tokens.text-1;
  size: tokens.text-base;
}

.caption {
  pad: tokens.space-2;
  size: tokens.text-lg;
  weight: tokens.weight-bold;
  color: tokens.text-1;
  text-align: left;
}
`,
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* modal                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * An accessible dialog: `role="dialog"` + `aria-modal="true"` +
 * `aria-labelledby` pointing at the title id, a keyboard-accessible close
 * `<button type="button">` with visible text and an `aria-label`, and
 * `setup` + `onClose` (which `emit`s `close`).
 *
 * HONEST SCOPE: `:if`-driven open/close STRUCTURAL toggling is NOT a runtime
 * behavior in this release — ADX has no structural reactivity. The pattern
 * ships correct STATIC dialog semantics plus the close handler; a host controls
 * whether the dialog is mounted. The dialog markup is always present in the
 * static HTML (SEO-readable), and `onClose` emits `close` for the host to act
 * on.
 */
const MODAL: PatternEntry = {
  name: "modal",
  description: "Accessible dialog with a labelled title and a keyboard close button.",
  files: [
    {
      path: "manifest.json",
      contents: `{
  "name": "Modal",
  "version": "1.0.0",
  "props": {
    "title": { "type": "string", "default": "Dialog title" },
    "message": { "type": "string", "default": "Dialog content goes here." },
    "closeLabel": { "type": "string", "default": "Close" }
  },
  "emits": ["close"],
  "slots": []
}
`,
    },
    {
      path: "structure.adx",
      contents: `<div .modal role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <h2 .title id="modal-title">{{title}}</h2>
  <p .message>{{message}}</p>
  <button .close type="button" aria-label="Close dialog" @click="onClose">{{closeLabel}}</button>
</div>
`,
    },
    {
      path: "behavior.adx.js",
      contents: `export function setup(props) {
  return {
    title: props.title,
    message: props.message,
    closeLabel: props.closeLabel
  }
}

export function onClose(state) {
  emit('close', { title: state.title })
}
`,
    },
    {
      path: "style.adx.css",
      contents: `@use tokens;

.modal {
  display: flex;
  flex-direction: column;
  gap: tokens.space-3;
  pad: tokens.space-6;
  bg: tokens.surface-0;
  radius: tokens.radius-lg;
  shadow: tokens.shadow-lg;
}

.title {
  margin: 0;
  size: tokens.text-xl;
  weight: tokens.weight-bold;
  color: tokens.text-1;
}

.message {
  margin: 0;
  size: tokens.text-base;
  color: tokens.text-2;
  line-height: 1.5;
}

.close {
  align-self: flex-end;
  /* Token-sized min-height keeps the control at/above the 44px touch target
     the UX baseline requires (space-12 = 48px). */
  min-height: tokens.space-12;
  pad: tokens.space-2 tokens.space-4;
  bg: tokens.primary;
  color: tokens.surface-0;
  radius: tokens.radius-md;
  size: tokens.text-base;
  weight: tokens.weight-medium;
  border: none;
  cursor: pointer;
}

.close:hover {
  bg: tokens.secondary;
}

.close:active {
  opacity: 0.85;
}
`,
    },
  ],
};

/**
 * The built-in pattern catalog. Each key is a scaffoldable pattern; adding one
 * is purely a data edit here. `adx pattern` / `adx pattern --list` lists the
 * keys (sorted); an unknown name errors with the sorted available names.
 */
export const PATTERNS: Record<string, PatternEntry> = {
  form: FORM,
  table: TABLE,
  modal: MODAL,
};

/**
 * Scaffold a pattern's four files flat into `targetDir` via the shared
 * conflict-safe {@link writeFileSet}: the component lands exactly in
 * `targetDir` (e.g. `adx pattern form` -> `./form/{4 files}`), matching `adx
 * create`. If any file already exists it writes nothing and throws the
 * `[ADX] … already exists; refusing to overwrite` error.
 *
 * @returns the relative paths written, in order.
 */
export function scaffoldPattern(entry: PatternEntry, targetDir: string): string[] {
  return writeFileSet(resolve(targetDir), entry.files);
}
