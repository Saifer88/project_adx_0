/**
 * Behavior export scanner (`behavior.adx.js`).
 *
 * Finds exports BY NAME only — no deep JS parse. We locate top-level
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

const LIFECYCLE = new Set(["onMounted", "onUnmounted", "onUpdated"]);
const EXPORT_RE =
  /\bexport\s+(?:async\s+)?(?:function\s*\*?|const|let|var)\s+([A-Za-z_$][\w$]*)/g;

/**
 * Scan behavior source into a classified {@link BehaviorApi}.
 *
 * @param src  behavior.adx.js source text
 * @param _file file name (reserved for future diagnostics; unused in M1)
 */
export function scanBehavior(src: string, _file?: string): BehaviorApi {
  void _file;
  const names = new Set<string>();
  EXPORT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = EXPORT_RE.exec(src)) !== null) {
    names.add(match[1]);
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
