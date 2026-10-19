/**
 * Behavior export scanner (`behavior.adx.js`).
 *
 * Parses JavaScript and classifies top-level
 * `export function <name>` and `export const <name>` declarations and classify
 * each by naming convention:
 *   - `setup`                     -> the required state factory
 *   - `on<Event>` (e.g. onClick)  -> event handlers
 *   - `get<Name>` (e.g. getFoo)   -> computed values
 *   - onMounted/onUnmounted/onUpdated -> lifecycle hooks
 *
 * Everything else is recorded as `other` so later stages can warn if needed.
 */

import type { BehaviorApi } from "./types.js";
import { parse, type ExportNamedDeclaration } from "acorn";
import { adxError, adxFileError } from "../errors.js";

const LIFECYCLE = new Set(["onMounted", "onUnmounted", "onUpdated"]);

export const EXPORT_RE =
  /\bexport\s+(?:async\s+)?(?:function\s*\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

export function behaviorDeclarations(
  src: string,
  file = "behavior.adx.js",
): ExportNamedDeclaration[] {
  let program;
  try {
    program = parse(src, { ecmaVersion: "latest", sourceType: "module", locations: true });
  } catch (error) {
    const failure = error as { message: string; loc?: { line: number } };
    throw adxError(file, failure.loc?.line ?? 1, failure.message);
  }
  const exports: ExportNamedDeclaration[] = [];
  for (const node of program.body) {
    if (node.type === "ImportDeclaration" || node.type === "ExportAllDeclaration" || node.type === "ExportDefaultDeclaration") {
      throw adxFileError(file, "Use named function or variable exports; imports and re-exports are unsupported");
    }
    if (node.type !== "ExportNamedDeclaration") continue;
    const declaration = node.declaration;
    if (!declaration || (declaration.type !== "FunctionDeclaration" && declaration.type !== "VariableDeclaration")) {
      throw adxFileError(file, "Use named function or variable export declarations");
    }
    if (declaration.type === "VariableDeclaration" && declaration.declarations.some((entry) => entry.id.type !== "Identifier")) {
      throw adxFileError(file, "Destructured exports are unsupported");
    }
    exports.push(node);
  }
  return exports;
}

/**
 * Scan behavior source into a classified {@link BehaviorApi}.
 *
 * @param src  behavior.adx.js source text
 * @param _file file name (reserved for future diagnostics; unused in M1)
 */
export function scanBehavior(src: string, file?: string): BehaviorApi {
  const names = new Set<string>();
  for (const node of behaviorDeclarations(src, file)) {
    const declaration = node.declaration!;
    if (declaration.type === "FunctionDeclaration" && declaration.id) {
      names.add(declaration.id.name);
    } else if (declaration.type === "VariableDeclaration") {
      for (const entry of declaration.declarations) {
        if (entry.id.type === "Identifier") names.add(entry.id.name);
      }
    }
  }

  const events: string[] = [];
  const computed: string[] = [];
  const lifecycle: string[] = [];
  const other: string[] = [];
  let hasSetup = false;

  for (const name of names) {
    if (name === "setup") {
      hasSetup = true;
    } else if (LIFECYCLE.has(name)) {
      lifecycle.push(name);
    } else if (isHandlerName(name)) {
      events.push(name);
    } else if (isComputedName(name)) {
      computed.push(name);
    } else {
      other.push(name);
    }
  }

  return {
    hasSetup,
    events: events.sort(),
    computed: computed.sort(),
    lifecycle: lifecycle.sort(),
    other: other.sort(),
    all: [...names].sort(),
  };
}

/** `on<Event>` with a capitalized tail, excluding lifecycle names. */
function isHandlerName(name: string): boolean {
  return /^on[A-Z]/.test(name) && !LIFECYCLE.has(name);
}

/** `get<Name>` with a capitalized tail. */
function isComputedName(name: string): boolean {
  return /^get[A-Z]/.test(name);
}
