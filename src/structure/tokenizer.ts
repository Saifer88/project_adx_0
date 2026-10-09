/**
 * Tokenizer for `.structure.adx`.
 *
 * Splits the source into a flat token stream the recursive-descent parser
 * consumes. It recognizes three structural shapes — open/self-closing tags,
 * close tags, and text runs — and drops `<!-- comments -->`. Attribute content
 * is captured raw (the parser does the fine-grained attribute parsing) so the
 * tokenizer stays small and fast.
 */

import { SourceText } from "../source.js";
import { adxError } from "../errors.js";

export type Token =
  | { type: "open"; tag: string; attrs: string; selfClosing: boolean; line: number }
  | { type: "close"; tag: string; line: number }
  | { type: "text"; value: string; line: number };

const TAG_NAME = /^[a-zA-Z][a-zA-Z0-9-]*/;

/** HTML void elements that may omit the self-closing slash (grammar 7). */
export const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export function tokenize(src: SourceText): Token[] {
  const text = src.text;
  const file = src.file;
  const tokens: Token[] = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    if (text[i] === "<") {
      // Comment?
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i + 4);
        if (end === -1) {
          throw adxError(file, src.lineAt(i), "Unterminated comment");
        }
        i = end + 3;
        continue;
      }

      const line = src.lineAt(i);

      // Close tag: </name>
      if (text.startsWith("</", i)) {
        let j = i + 2;
        const nameMatch = TAG_NAME.exec(text.slice(j));
        if (!nameMatch) {
          throw adxError(file, line, "Expected tag name after '</'");
        }
        const tag = nameMatch[0];
        j += tag.length;
        while (j < n && /\s/.test(text[j])) j++;
        if (text[j] !== ">") {
          throw adxError(file, line, `Malformed close tag "</${tag}"`);
        }
        tokens.push({ type: "close", tag, line });
        i = j + 1;
        continue;
      }

      // Open / self-closing tag: <name ...attrs> or <name ... />
      let j = i + 1;
      const nameMatch = TAG_NAME.exec(text.slice(j));
      if (!nameMatch) {
        throw adxError(file, line, "Expected tag name after '<'");
      }
      const tag = nameMatch[0];
      j += tag.length;

      // Scan attributes raw until the matching unquoted '>'.
      const attrStart = j;
      let inQuote: string | null = null;
      while (j < n) {
        const c = text[j];
        if (inQuote) {
          if (c === inQuote) inQuote = null;
          j++;
          continue;
        }
        if (c === '"' || c === "'") {
          inQuote = c;
          j++;
          continue;
        }
        if (c === ">") break;
        j++;
      }
      if (j >= n) {
        throw adxError(file, line, `Unterminated tag "<${tag}"`);
      }

      let attrs = text.slice(attrStart, j);
      let selfClosing = false;
      const trimmed = attrs.replace(/\s+$/, "");
      if (trimmed.endsWith("/")) {
        selfClosing = true;
        attrs = trimmed.slice(0, -1);
      }
      if (VOID_ELEMENTS.has(tag)) {
        selfClosing = true;
      }

      tokens.push({ type: "open", tag, attrs, selfClosing, line });
      i = j + 1;
      continue;
    }

    // Text run until the next '<'.
    const line = src.lineAt(i);
    const start = i;
    while (i < n && text[i] !== "<") i++;
    const value = text.slice(start, i);
    if (value.trim().length > 0) {
      tokens.push({ type: "text", value, line });
    }
  }

  return tokens;
}
