/**
 * The "known HTML element" allowlist.
 *
 * The HTML emitter uses this set to decide whether an element's tag is a
 * standard HTML element (emitted verbatim) or a custom component tag (resolved
 * against `manifest.deps` and composed). A tag that is neither in this set nor
 * `slot` and does not resolve via deps is a fatal "Unknown component" error.
 *
 * The list is a curated snapshot of standard HTML tag names (plus the common
 * SVG container tags authors may embed inline). It intentionally does NOT
 * include `slot`, which the emitter handles separately as a projection point.
 */

export const HTML_TAGS: ReadonlySet<string> = new Set<string>([
  // Document / sections
  "html",
  "head",
  "body",
  "base",
  "link",
  "meta",
  "style",
  "title",
  "address",
  "article",
  "aside",
  "footer",
  "header",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hgroup",
  "main",
  "nav",
  "section",
  "search",
  // Grouping content
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "hr",
  "li",
  "menu",
  "ol",
  "p",
  "pre",
  "ul",
  // Text-level semantics
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "br",
  "cite",
  "code",
  "data",
  "dfn",
  "em",
  "i",
  "kbd",
  "mark",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "time",
  "u",
  "var",
  "wbr",
  // Edits
  "del",
  "ins",
  // Embedded content
  "area",
  "audio",
  "img",
  "map",
  "track",
  "video",
  "embed",
  "iframe",
  "object",
  "picture",
  "portal",
  "source",
  // Scripting
  "canvas",
  "noscript",
  "script",
  // Tables
  "caption",
  "col",
  "colgroup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  // Forms
  "button",
  "datalist",
  "fieldset",
  "form",
  "input",
  "label",
  "legend",
  "meter",
  "optgroup",
  "option",
  "output",
  "progress",
  "select",
  "textarea",
  // Interactive elements
  "details",
  "dialog",
  "summary",
  // Web components host
  "template",
  // Common inline SVG containers
  "svg",
  "path",
  "g",
  "circle",
  "rect",
  "line",
  "polyline",
  "polygon",
  "ellipse",
  "text",
  "use",
  "defs",
]);

/** True when `tag` is a standard HTML element the emitter renders verbatim. */
export function isHtmlTag(tag: string): boolean {
  return HTML_TAGS.has(tag);
}
