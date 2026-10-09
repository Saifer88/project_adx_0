/**
 * Source position helpers.
 *
 * The tokenizer/parser work on raw offsets; error messages need 1-based line
 * numbers. `SourceText` precomputes line-start offsets so offset -> line is a
 * cheap binary search, which keeps the parser fast on large components.
 */

export class SourceText {
  readonly file: string;
  readonly text: string;
  /** Offset at which each line starts. lineStarts[0] === 0. */
  private readonly lineStarts: number[];

  constructor(text: string, file: string) {
    this.text = text;
    this.file = file;
    this.lineStarts = [0];
    for (let i = 0; i < text.length; i++) {
      if (text.charCodeAt(i) === 10 /* \n */) {
        this.lineStarts.push(i + 1);
      }
    }
  }

  /** Return the 1-based line number containing `offset`. */
  lineAt(offset: number): number {
    const starts = this.lineStarts;
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo + 1;
  }
}
