/**
 * Project scaffolding for `adx init [name]`.
 *
 * Templates are embedded so installed CLIs do not need the repository's
 * fixtures. Package metadata is read from the generating CLI's installation,
 * not CWD, to pin the starter's local dependency to that exact release.
 *
 * The starter is deliberately minimal but COMPLETE: one component
 * (`hello-card/`) whose props all have defaults (so `adx build hello-card`
 * succeeds with no `--data`), a page manifest (`index.json`) that places the
 * component at the site root, design tokens, npm scripts, and a short README.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { adxFileError } from "./errors.js";

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

/**
 * `hello-card/structure.adx` — semantic card, token-styled, interpolated text.
 * The card title is the single-card starter page's main heading, so it is an
 * `<h1>`: the compiled page then has exactly one `<h1>` and never skips a
 * heading level (SEO/a11y baseline). A multi-card page would reserve the `<h1>`
 * for a page header and demote this; the minimal starter has only this card.
 */
const STRUCTURE = `<article .card>
  <h1 .title>{{title}}</h1>
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

.dismiss:hover {
  bg: tokens.secondary;
}

.dismiss:active {
  opacity: 0.85;
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

const README = `# ADX starter

A minimal project scaffolded with \`adx init\`. It has one component
(\`hello-card/\`) and one page (\`index.json\`) that places the component at the
site root, plus editable design tokens.

## Install, build, and preview

\`\`\`sh
npm install
npm run check
npm run build
npm run serve
\`\`\`

Run these from the project root. ADX is a local development dependency pinned
to the CLI version that created this starter; no global installation is needed.
Node.js 18+ and npm are required (Node.js 24 LTS recommended).

The page builds to \`dist/index.html\`. Open the URL printed by \`serve\`.
After editing source, run check and build again, then refresh the browser.
Serving is static only: it does not rebuild or hot reload. Stop with Ctrl+C.

## Share the project

Commit the source, \`package.json\`, and the \`package-lock.json\` generated by
\`npm install\`. The generated \`.gitignore\` excludes \`node_modules/\` and
\`dist/\`. Another developer can clone the repository and run the commands above;
CI can use \`npm ci\` once the lockfile is committed. Build/check need development
dependencies, so do not omit them during installation.

## AI assistance

Commit [AGENTS.md](./AGENTS.md) with the project. It sets Caveman chat defaults,
application-only scope, and local CLI setup instructions. Agents without the
Caveman skill can follow the included concise-writing rules. Code, documentation,
and UI copy stay in normal prose. If your client does not load \`AGENTS.md\`
automatically, explicitly ask it to read the file.

## Other CLI commands

\`\`\`sh
npx adx build hello-card          # standalone component -> dist/hello-card/
npx adx tokens
npm run serve -- --port 4000
\`\`\`

The package name is \`project-adx-0\`; \`adx\` is its local executable.
Read the installed \`node_modules/project-adx-0/docs/agent-reference.md\` for
guidance matching this version. Build/check execute component JavaScript;
compile only trusted components.
`;

const AGENTS = `# ADX frontend instructions

## Communication

Default to Caveman ultra for chat. If the caveman skill is available, activate
its ultra mode.
Otherwise follow these rules directly:

- Use the shortest unambiguous phrasing. Remove filler, repetition, and narration.
  Omit connecting words only when meaning remains clear. Do not invent abbreviations.
- Preserve technical facts, exact errors, qualifications, and important warnings.
- Report changes, verification results, and remaining blockers concisely.
- Keep code, comments, documentation, and UI copy in normal prose.
- Clarity wins over compression. Honor explicit requests for detail or normal style.

## Application scope

- Work on this app's components, pages, assets, and design tokens.
- Treat the ADX compiler and CLI as dependencies, not application source.
- Do not edit \`node_modules/\`, the installed ADX package, or generated \`dist/\`
  output. Change application source and rebuild.
- Only work on ADX framework source when the user explicitly requests framework development;
  use a separate source checkout, never patch the installed package.
- If an interaction exceeds supported APIs, explain the limitation and agree on
  an alternative. Do not silently modify the framework or switch frameworks.

## Local CLI and workflow

- Work from the app root. If \`project-adx-0\` is declared, preserve its version;
  run \`npm install\` when the local CLI is missing. Include dev dependencies.
- Only if that dependency is absent, add it with
  \`npm install --save-dev --save-exact project-adx-0\`.
- Do not install the npm package named \`adx\`; that is the executable name.
  If installation fails, report the error instead of using a global fallback.
- After local installation succeeds, use \`npm run check\`, \`npm run build\`,
  and \`npm run serve\`. For other commands use \`npx adx ...\`.
- Read the [installed ADX reference](node_modules/project-adx-0/docs/agent-reference.md)
  for syntax and supported APIs. Read a component's manifest before changing it.
- Rebuild after edits; serving is static only. Check layout and interactions in
  a browser: compilation alone does not validate them.
- Build/check execute component JavaScript. Compile only trusted components.
`;

function packageJson(): string {
  const file = fileURLToPath(new URL("../package.json", import.meta.url));
  let metadata: unknown;
  try {
    metadata = JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw adxFileError(file, `Cannot load ADX package metadata: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (
    typeof metadata !== "object" || metadata === null ||
    !("name" in metadata) || typeof metadata.name !== "string" || !metadata.name ||
    !("version" in metadata) || typeof metadata.version !== "string" || !metadata.version ||
    !("engines" in metadata) || typeof metadata.engines !== "object" || metadata.engines === null ||
    !("node" in metadata.engines) || typeof metadata.engines.node !== "string" || !metadata.engines.node
  ) {
    throw adxFileError(file, "ADX package metadata must include name, version, and engines.node");
  }
  return JSON.stringify({
    name: "adx-app",
    version: "0.0.0",
    private: true,
    type: "module",
    scripts: {
      build: "adx build index.json",
      check: "adx check index.json",
      serve: "adx serve dist",
    },
    devDependencies: { [metadata.name]: metadata.version },
    engines: { node: metadata.engines.node },
  }, null, 2) + "\n";
}

/**
 * The complete scaffold file set, as `{ path, contents }` with POSIX-relative
 * paths. This same list drives the clobber guard: if ANY of these already
 * exists under the target, the scaffolder refuses and writes nothing.
 */
export const SCAFFOLD_FILES: { path: string; contents: string | (() => string) }[] = [
  { path: "hello-card/manifest.json", contents: MANIFEST },
  { path: "hello-card/structure.adx", contents: STRUCTURE },
  { path: "hello-card/behavior.adx.js", contents: BEHAVIOR },
  { path: "hello-card/style.adx.css", contents: STYLE },
  { path: "tokens/design-tokens.json", contents: TOKENS },
  { path: "index.json", contents: PAGE },
  { path: "README.md", contents: README },
  { path: "package.json", contents: packageJson },
  { path: ".gitignore", contents: "node_modules/\ndist/\n" },
  { path: "AGENTS.md", contents: AGENTS },
];

/**
 * Conflict-safe writer shared by every scaffolder (`adx init`, `adx create`,
 * and `adx pattern`). The single home of the no-partial-write guard.
 *
 * REFUSES TO CLOBBER: resolves every path against `base` and, if ANY already
 * exists, throws `[ADX] <abs> - already exists; refusing to overwrite` BEFORE
 * creating any directory or writing any file — so a conflict leaves the target
 * untouched. On success it `mkdir -p`s each parent and writes each file in
 * order, returning the input relative paths in the same order.
 *
 * Callers resolve their templates (including any throwing thunks) into concrete
 * strings BEFORE calling this, so a template that fails also writes nothing.
 *
 * @param base   Absolute base directory the relative paths resolve against.
 * @param files  The `{ path, contents }` set to write, in output order.
 * @returns the input relative paths, in order.
 */
export function writeFileSet(
  base: string,
  files: { path: string; contents: string }[],
): string[] {
  // 1. Clobber guard: fail before touching the filesystem if anything exists.
  for (const file of files) {
    const abs = resolve(base, file.path);
    if (existsSync(abs)) {
      throw new Error(
        `[ADX] ${abs} - already exists; refusing to overwrite`,
      );
    }
  }

  // 2. Write every file; parents are created on demand.
  for (const file of files) {
    const abs = resolve(base, file.path);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, file.contents, "utf8");
  }

  return files.map((file) => file.path);
}

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
  // Resolve every thunk into a concrete string BEFORE writing, so a broken
  // installation (e.g. a throwing packageJson()) leaves nothing partially
  // written. Thunk resolution must stay before the write loop in writeFileSet.
  const files = SCAFFOLD_FILES.map((file) => ({
    path: file.path,
    contents: typeof file.contents === "function" ? file.contents() : file.contents,
  }));

  return writeFileSet(resolve(targetDir), files);
}
