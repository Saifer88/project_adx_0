/**
 * Project scaffolding for `adx init [name]`.
 *
 * Every file the scaffolder writes is an embedded string constant — nothing is
 * read from disk at runtime. A global install (`npm i -g adx`) ships only
 * `dist`, `tokens`, and `README.md` (see package.json#files); it has no
 * `fixtures/`, so reading templates from disk would break the installed CLI.
 * Keeping the templates inline makes `adx init` work from any CWD.
 *
 * Only `node:fs` / `node:path` are used (no new dependencies), consistent with
 * the rest of the CLI.
 *
 * The starter is deliberately minimal but COMPLETE: one component
 * (`hello-card/`) whose props all have defaults (so `adx build hello-card`
 * succeeds with no `--data`), a page manifest (`index.json`) that places the
 * component at the site root, the real design tokens, and a short README.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** `hello-card/manifest.json` — props all have defaults, so no `--data` needed. */
const MANIFEST = `{
  "name": "HelloCard",
  "version": "1.0.0",
  "props": {
    "title": { "type": "string", "default": "Hello, ADX" },
    "message": {
      "type": "string",
      "default": "Welcome to your new ADX project."
    }
  },
  "emits": ["dismiss"],
  "slots": []
}
`;

/** `hello-card/structure.adx` — semantic card, token-styled, interpolated text. */
const STRUCTURE = `<article .card>
  <h2 .title>{{title}}</h2>
  <p .message>{{message}}</p>
  <button .dismiss type="button" @click="onDismiss">Dismiss</button>
</article>
`;

/** `hello-card/behavior.adx.js` — pure functions; setup returns the state. */
const BEHAVIOR = `export function setup(props) {
  return {
    title: props.title,
    message: props.message
  }
}

export function onDismiss(state) {
  emit('dismiss', { title: state.title })
}
`;

/** `hello-card/style.adx.css` — only real design tokens, no hardcoded hex. */
const STYLE = `@use tokens;

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

.dismiss {
  align-self: flex-start;
  pad: tokens.space-2 tokens.space-4;
  bg: tokens.primary;
  color: tokens.surface-0;
  radius: tokens.radius-md;
  size: tokens.text-sm;
  weight: tokens.weight-medium;
  border: none;
  cursor: pointer;
}
`;

/** `index.json` — a page placing the starter component at the site root. */
const PAGE = `{
  "page": "index",
  "title": "My ADX App",
  "description": "A new project scaffolded with adx init.",
  "lang": "en",
  "schema": "WebPage",
  "components": [
    {
      "use": "./hello-card",
      "data": {
        "title": "Hello, ADX",
        "message": "Welcome to your new ADX project."
      }
    }
  ]
}
`;

/**
 * `tokens/design-tokens.json` — the repo's real token source embedded verbatim
 * so token names resolve regardless of CWD. Keep in sync with
 * `tokens/design-tokens.json` at the repo root.
 */
const TOKENS = `{
  "$schema-note": "ADX design-token source of truth. Loader maps tokens.<name> -> value. Light theme; colors chosen to meet the UX/UI contrast baseline (body text >=4.5:1 on surface-0, non-text/large >=3:1).",
  "spacing": {
    "space-0": "0",
    "space-1": "4px",
    "space-2": "8px",
    "space-3": "12px",
    "space-4": "16px",
    "space-6": "24px",
    "space-8": "32px",
    "space-12": "48px",
    "space-16": "64px"
  },
  "colors": {
    "surface-0": "#ffffff",
    "surface-1": "#f4f5f7",
    "surface-2": "#e4e7eb",
    "surface-3": "#cbd2d9",
    "text-1": "#1a1f29",
    "text-2": "#4a5361",
    "text-3": "#6b7684",
    "primary": "#1d4ed8",
    "secondary": "#6d28d9",
    "success": "#15803d",
    "warning": "#b45309",
    "error": "#b91c1c",
    "info": "#0369a1",
    "border": "#cbd2d9"
  },
  "radius": {
    "radius-sm": "4px",
    "radius-md": "8px",
    "radius-lg": "12px",
    "radius-full": "9999px"
  },
  "shadow": {
    "shadow-sm": "0 1px 2px rgba(16, 24, 40, 0.06)",
    "shadow-md": "0 4px 8px rgba(16, 24, 40, 0.1)",
    "shadow-lg": "0 12px 24px rgba(16, 24, 40, 0.14)"
  },
  "typography": {
    "text-xs": "12px",
    "text-sm": "14px",
    "text-base": "16px",
    "text-lg": "18px",
    "text-xl": "20px",
    "text-2xl": "24px",
    "text-3xl": "30px",
    "weight-normal": "400",
    "weight-medium": "500",
    "weight-bold": "700",
    "font-sans": "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    "font-serif": "Georgia, Cambria, Times New Roman, serif",
    "font-mono": "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
  },
  "breakpoints": {
    "breakpoint-sm": "640px",
    "breakpoint-md": "768px",
    "breakpoint-lg": "1024px",
    "breakpoint-xl": "1280px"
  }
}
`;

/** `README.md` — explains building the component, the page, and serving. */
const README = `# ADX starter

A minimal project scaffolded with \`adx init\`. It has one component
(\`hello-card/\`) and one page (\`index.json\`) that places the component at the
site root, plus the design tokens the compiler needs.

## Build the component

Compile the standalone component to \`dist/hello-card/\`:

\`\`\`sh
adx build hello-card
\`\`\`

## Build the page

Compile the page to the site root of \`dist/\` (an \`index\` page maps to
\`dist/index.html\`):

\`\`\`sh
adx build index.json
\`\`\`

Both commands read tokens from \`tokens/design-tokens.json\` by default, so run
them from this project directory.

## Preview locally

Serve the compiled output and open the printed URL:

\`\`\`sh
adx serve dist
\`\`\`

\`adx serve\` only serves already-compiled files — build first, then serve.
`;

/**
 * The complete scaffold file set, as `{ path, contents }` with POSIX-relative
 * paths. This same list drives the clobber guard: if ANY of these already
 * exists under the target, the scaffolder refuses and writes nothing.
 */
export const SCAFFOLD_FILES: { path: string; contents: string }[] = [
  { path: "hello-card/manifest.json", contents: MANIFEST },
  { path: "hello-card/structure.adx", contents: STRUCTURE },
  { path: "hello-card/behavior.adx.js", contents: BEHAVIOR },
  { path: "hello-card/style.adx.css", contents: STYLE },
  { path: "tokens/design-tokens.json", contents: TOKENS },
  { path: "index.json", contents: PAGE },
  { path: "README.md", contents: README },
];

/**
 * Scaffold a new ADX starter project into `targetDir`.
 *
 * REFUSES TO CLOBBER: resolves every scaffold path first and, if ANY already
 * exists, throws `[ADX] <path> - already exists; refusing to overwrite` BEFORE
 * creating any directory or writing any file — so a conflict leaves the target
 * untouched (no partial overwrite). An empty or non-existent target is fine.
 *
 * On success, creates the target (recursively), writes every file, and returns
 * the list of written relative paths in a stable order.
 *
 * @param targetDir  Absolute or CWD-relative directory to scaffold into.
 * @returns the relative paths written, in scaffold order.
 */
export function scaffoldProject(targetDir: string): string[] {
  const base = resolve(targetDir);

  // 1. Clobber guard: fail before touching the filesystem if anything exists.
  for (const file of SCAFFOLD_FILES) {
    const abs = resolve(base, file.path);
    if (existsSync(abs)) {
      throw new Error(
        `[ADX] ${abs} - already exists; refusing to overwrite`,
      );
    }
  }

  // 2. Write every file, creating parent directories as needed.
  for (const file of SCAFFOLD_FILES) {
    const abs = resolve(base, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.contents, "utf8");
  }

  return SCAFFOLD_FILES.map((file) => file.path);
}
