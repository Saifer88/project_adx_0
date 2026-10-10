/**
 * Shared `get*` export name -> bare computed-key lowering.
 *
 * `EvalScope.computed` is keyed by the BARE computed name (grammar section 4.3):
 * a bare ident `displayName` resolves to the result of the `getDisplayName`
 * export. This helper derives that bare key from an export name.
 *
 * Exact rule (pinned, byte-for-byte): strip the leading `get` (exactly three
 * chars — the scanner only classifies `get[A-Z]…`, so `get` is always present),
 * then lowercase ONLY the first remaining character, leaving every subsequent
 * character verbatim. This is deliberately NOT a camelCase smart-split, so
 * acronyms are preserved past the first char:
 *
 *   bareComputedKey("getDisplayName") === "displayName"
 *   bareComputedKey("getURL")         === "uRL"
 *   bareComputedKey("getX")           === "x"
 *
 * One helper, two call sites: Phase 1 builds `scope.computed` keyed by this; a
 * later phase derives its `computedKeys` freeze set from the same function, so
 * the two must agree for every input including acronyms.
 */
export function bareComputedKey(exportName: string): string {
  const tail = exportName.slice(3); // strip the leading "get"
  return tail.charAt(0).toLowerCase() + tail.slice(1); // lowercase ONLY char 0
}
