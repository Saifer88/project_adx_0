/**
 * Design-token loader types.
 */

/** Raw shape of tokens/design-tokens.json: grouped string-valued maps. */
export interface RawTokens {
  spacing?: Record<string, string>;
  colors?: Record<string, string>;
  radius?: Record<string, string>;
  shadow?: Record<string, string>;
  typography?: Record<string, string>;
  breakpoints?: Record<string, string>;
  [group: string]: Record<string, string> | string | undefined;
}

/** A single token category and its `name -> value` entries, in file order. */
export interface TokenGroup {
  /** Category name, e.g. "spacing", "colors". */
  group: string;
  /** The group's tokens as `[name, value]` pairs, in file order. */
  entries: Array<[name: string, value: string]>;
}

/** Resolved token table queried by the compiler as `tokens.<name>`. */
export interface TokenTable {
  /** Resolve a `tokens.<name>` reference (or bare `<name>`) to its value. */
  resolve(ref: string): string;
  /** Whether a `tokens.<name>` reference (or bare `<name>`) exists. */
  has(ref: string): boolean;
  /** Comma-joined spacing indices, e.g. "0,1,2,3,4,6,8,12,16". */
  availableSpacing(): string;
  /** All token names (without the `tokens.` prefix). */
  names(): string[];
  /**
   * Tokens grouped by category, in file order, preserving the category
   * structure the flat `name -> value` table drops. Used by `adx tokens` to
   * render a grouped listing without re-reading/re-parsing the source file.
   */
  groups(): TokenGroup[];
}
