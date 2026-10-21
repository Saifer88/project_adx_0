/**
 * Component scaffolding for `adx create <path>/<component-name>`.
 *
 * The create argument is parsed as a POSIX forward-slash path: every segment
 * LEFT of the final `/` is a nested directory (created mkdir -p style on write),
 * and the LAST segment is the component name. A bare name (no `/`) still
 * scaffolds flat in the current directory, byte-for-byte as before. Each
 * `/`-separated segment must independently be a valid slug, and the PascalCase
 * manifest `name` is derived from the LAST segment only (`landing/footer` ->
 * dir `landing/footer/`, name `Footer`).
 *
 * Unlike `adx init` (which lays down a whole starter project), `create` adds ONE
 * new four-file component into an EXISTING project. The template mirrors the
 * `hello-card` quality bar from `src/scaffold.ts`: every prop has a default so
 * `adx build <name>` / `adx check <name>` succeed with no `--data`, the markup
 * is semantic and token-styled, and the control carries a token-sized touch
 * target (WCAG-AA baseline).
 *
 * The component is composed INTO a page that owns the page `<h1>`, so its title
 * is an `<h2>` (never an `<h1>`): a standalone build still produces a clean,
 * crawlable fragment, and dropping it into a page keeps one `<h1>` per page.
 */

import { resolve } from "node:path";
import { writeFileSet } from "./scaffold.js";

/** Valid component name: the page loader's slug shape (lowercase alphanumerics
 * in hyphen-separated groups). Rejects uppercase, leading/trailing hyphens,
 * empty, `..`, and path separators. */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Validate a component name, throwing the canonical `[ADX] …` error on a bad
 * name. The accepted shape is the slug `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`, which
 * already excludes path separators, `..`, uppercase, leading/trailing hyphens,
 * and the empty string — so a valid name is always a safe single directory.
 */
export function validateComponentName(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `[ADX] ${name} - invalid component name (lowercase, hyphenated; no path separators)`,
    );
  }
  return name;
}

/**
 * Parse a create argument as a POSIX forward-slash path into its directory
 * prefix segments plus the final component-name segment.
 *
 * Splits strictly on `/`. EACH segment must independently satisfy the slug rule
 * {@link NAME_RE} (`/^[a-z0-9]+(?:-[a-z0-9]+)*$/`), which already excludes empty
 * segments (so `landing//footer`, `landing/`, `/footer` all fail), `..`,
 * backslashes (a `\` never splits, so `a\b` is one segment that fails the
 * slug), uppercase, and leading/trailing hyphens. An absolute path has an empty
 * leading segment and is therefore rejected. On any bad segment it throws the
 * canonical `[ADX] <input> - …` error echoing the WHOLE user input, so no files
 * are written. The LAST element is `name` (the component dir and PascalCase
 * source); the preceding elements are `dirs` (the mkdir -p prefix).
 */
export function parseComponentPath(input: string): { dirs: string[]; name: string } {
  const segments = input.split("/");
  const ok = segments.length > 0 && segments.every((seg) => NAME_RE.test(seg));
  if (!ok) {
    throw new Error(
      `[ADX] ${input} - invalid component path (lowercase, hyphenated segments; no empty, '..', backslash, or absolute paths)`,
    );
  }
  const name = segments[segments.length - 1];
  const dirs = segments.slice(0, -1);
  return { dirs, name };
}

/** Derive a PascalCase manifest name from a slug (`widget-card` -> `WidgetCard`). */
export function pascalCase(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * The four `.adx` files for a new component, under `<name>/`. Every prop has a
 * default so the component builds and checks with no `--data`. The title is an
 * `<h2>` (the component is composed under a page that owns the `<h1>`), the CSS
 * uses only real tokens, and the action button carries a token-sized
 * `min-height` (`space-12` = 48px, at/above the 44px touch target baseline).
 */
export function templatedFiles(
  name: string,
): { path: string; contents: string }[] {
  // Parse the argument as a POSIX path: leading segments are a mkdir -p prefix,
  // the LAST segment is the component name AND the PascalCase source. A bare
  // name has an empty prefix, so `dir`/paths/name are byte-for-byte as before.
  const { dirs, name: last } = parseComponentPath(name);
  const prefix = dirs.length > 0 ? `${dirs.join("/")}/${last}` : last;
  const pascal = pascalCase(last);

  const manifest = `{
  "name": "${pascal}",
  "version": "1.0.0",
  "props": {
    "title": { "type": "string", "default": "${pascal}" },
    "message": {
      "type": "string",
      "default": "A new ADX component."
    }
  },
  "emits": ["action"],
  "slots": []
}
`;

  const structure = `<article .card>
  <h2 .title>{{title}}</h2>
  <p .message>{{message}}</p>
  <button .action type="button" @click="onAction">Action</button>
</article>
`;

  const behavior = `export function setup(props) {
  return {
    title: props.title,
    message: props.message
  }
}

export function onAction(state) {
  emit('action', { title: state.title })
}
`;

  const style = `@use tokens;

.card {
  display: flex;
  flex-direction: column;
  pad: tokens.space-6;
  gap: tokens.space-2;
  bg: tokens.surface-0;
  radius: tokens.radius-lg;
  shadow: tokens.shadow-md;
}

.title {
  margin: 0;
  size: tokens.text-lg;
  weight: tokens.weight-bold;
  color: tokens.text-1;
}

.message {
  margin: 0;
  size: tokens.text-base;
  color: tokens.text-2;
  line-height: 1.5;
}

.action {
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

.action:hover {
  bg: tokens.secondary;
}

.action:active {
  opacity: 0.85;
}
`;

  return [
    { path: `${prefix}/manifest.json`, contents: manifest },
    { path: `${prefix}/structure.adx`, contents: structure },
    { path: `${prefix}/behavior.adx.js`, contents: behavior },
    { path: `${prefix}/style.adx.css`, contents: style },
  ];
}

/**
 * Scaffold one new four-file component named `name` into `targetDir` (default
 * CWD). `name` may be a POSIX path (`landing/footer`): leading segments become
 * nested folders, the last segment is the component. Validates every segment
 * first (throwing the `[ADX] <input> - …` error on any bad/empty/`..`/backslash/
 * absolute segment so nothing is written), then delegates to the shared
 * conflict-safe {@link writeFileSet}: if any of the four component files already
 * exists it writes nothing and throws the `[ADX] … already exists; refusing to
 * overwrite` error. Intermediate directories are created mkdir -p style on
 * write, but only the four files form the overwrite-guarded set — creating into
 * an existing folder that lacks them succeeds.
 *
 * @returns the relative paths written, in order.
 */
export function scaffoldComponent(name: string, targetDir = "."): string[] {
  parseComponentPath(name);
  return writeFileSet(resolve(targetDir), templatedFiles(name));
}
