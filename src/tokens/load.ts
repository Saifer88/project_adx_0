/**
 * Design-token loader.
 *
 * Reads tokens/design-tokens.json (grouped maps) and flattens it into a flat
 * `name -> value` table. Token references may be written `tokens.<name>` (as in
 * `.style.adx.css`) or bare `<name>`; both resolve the same. Spacing indices
 * are exposed for the "available: 0,1,2,3,…" style error hint.
 */

import { readFileSync } from "node:fs";
import type { RawTokens, TokenGroup, TokenTable } from "./types.js";

/** Load the token table from `path` (the design-tokens.json file). */
export function loadTokens(path: string): TokenTable {
  return parseTokens(readFileSync(path, "utf8"));
}

/** Parse a token table from raw JSON text (used by loader and tests). */
export function parseTokens(raw: string): TokenTable {
  const data = JSON.parse(raw) as RawTokens;
  const flat = new Map<string, string>();
  const spacingIndices: string[] = [];
  // Preserve the category structure (and file order) that `flat` discards, so
  // callers like `adx tokens` can render a grouped listing from loader-owned
  // data instead of re-parsing the source file.
  const grouped: TokenGroup[] = [];

  for (const [group, entries] of Object.entries(data)) {
    if (typeof entries !== "object" || entries === null) {
      continue; // skip scalar meta fields like "$schema-note"
    }
    const groupEntries: Array<[string, string]> = [];
    for (const [name, value] of Object.entries(entries)) {
      flat.set(name, value);
      groupEntries.push([name, value]);
      if (group === "spacing" && name.startsWith("space-")) {
        spacingIndices.push(name.slice("space-".length));
      }
    }
    grouped.push({ group, entries: groupEntries });
  }

  const normalize = (ref: string): string =>
    ref.startsWith("tokens.") ? ref.slice("tokens.".length) : ref;

  return {
    resolve(ref: string): string {
      const key = normalize(ref);
      const value = flat.get(key);
      if (value === undefined) {
        throw new Error(`Unknown token "${ref}"`);
      }
      return value;
    },
    has(ref: string): boolean {
      return flat.has(normalize(ref));
    },
    availableSpacing(): string {
      return spacingIndices.join(",");
    },
    names(): string[] {
      return [...flat.keys()];
    },
    groups(): TokenGroup[] {
      return grouped;
    },
  };
}
