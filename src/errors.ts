/**
 * Shared error handling for the ADX compiler.
 *
 * Every compiler diagnostic uses the exact shape:
 *   `[ADX] <file>:<line> - <message>`
 * Manifest errors omit the line:
 *   `[ADX] manifest.json - <message>`
 *
 * This format is a contract (docs/adx-grammar.md section 9); tests assert it
 * verbatim, so do not reorder or re-space the pieces.
 */

export interface AdxErrorInit {
  /** Source file the error refers to, e.g. "structure.adx". */
  file: string;
  /** Human-readable message. Already-composed, no prefix. */
  message: string;
  /** 1-based line number. Omit for whole-file errors (e.g. manifest.json). */
  line?: number;
}

/**
 * A compiler error carrying structured location data. The `message` of the
 * thrown Error is the fully formatted `[ADX] ...` string so uncaught throws
 * still surface the canonical format.
 */
export class AdxError extends Error {
  readonly file: string;
  readonly adxLine?: number;

  constructor(init: AdxErrorInit) {
    super(formatError(init));
    this.name = "AdxError";
    this.file = init.file;
    this.adxLine = init.line;
  }
}

/**
 * Format a diagnostic into the canonical ADX string.
 *
 * With a line:    `[ADX] structure.adx:5 - <message>`
 * Without a line: `[ADX] manifest.json - <message>`
 */
export function formatError(init: AdxErrorInit): string {
  const location =
    init.line === undefined ? init.file : `${init.file}:${init.line}`;
  return `[ADX] ${location} - ${init.message}`;
}

/** Convenience constructor for a located (line-bearing) error. */
export function adxError(file: string, line: number, message: string): AdxError {
  return new AdxError({ file, line, message });
}

/** Convenience constructor for a whole-file (line-less) error. */
export function adxFileError(file: string, message: string): AdxError {
  return new AdxError({ file, message });
}
