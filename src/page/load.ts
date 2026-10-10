/**
 * Page-manifest loader + validator.
 *
 * Reads a page JSON file, validates the Phase 2 field rules, and returns a
 * {@link PageManifest} with defaults applied (`lang`, `canonical`). All errors
 * are line-less — a page manifest is JSON like `manifest.json` — and use the
 * exact strings from the Phase 2 error table:
 *   `[ADX] <page-file> - <message>`
 * The `<page-file>` is the path the caller passed (so the message points at the
 * file the author named on the command line).
 */

import { readFileSync } from "node:fs";
import { adxFileError } from "../errors.js";
import type { PageComponent, PageManifest } from "./types.js";

/** Valid slug: lowercase alphanumerics in hyphen-separated groups. */
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Slugs that map to the site root `/index.html`. */
const ROOT_SLUGS: ReadonlySet<string> = new Set(["index", "home"]);

/** Load + validate a page manifest from disk. `file` labels every error. */
export function loadPage(path: string): PageManifest {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw adxFileError(path, "Cannot read page manifest");
  }
  return parsePage(raw, path);
}

/** Parse + validate a page manifest from raw JSON text (loader + tests). */
export function parsePage(raw: string, file: string): PageManifest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw adxFileError(file, "Invalid JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw adxFileError(file, `Missing required field "page"`);
  }
  const obj = data as Record<string, unknown>;

  const page = requireString(obj, "page", file);
  if (!SLUG_RE.test(page)) {
    throw adxFileError(
      file,
      `Invalid page slug "${page}" (lowercase, hyphenated)`,
    );
  }
  const title = requireString(obj, "title", file);
  const description = requireString(obj, "description", file);

  const components = validateComponents(obj.components, file);

  const lang = optionalString(obj, "lang", file) ?? "en";
  const canonical =
    optionalString(obj, "canonical", file) ?? defaultCanonical(page);
  const schema = optionalString(obj, "schema", file);

  const manifest: PageManifest = {
    page,
    title,
    description,
    lang,
    canonical,
    components,
  };
  if (schema !== undefined) {
    manifest.schema = schema;
  }
  return manifest;
}

/** The canonical URL derived from the slug: `/` for root else `/<page>/`. */
function defaultCanonical(page: string): string {
  return ROOT_SLUGS.has(page) ? "/" : `/${page}/`;
}

function requireString(
  obj: Record<string, unknown>,
  field: string,
  file: string,
): string {
  const value = obj[field];
  if (value === undefined || value === null) {
    throw adxFileError(file, `Missing required field "${field}"`);
  }
  if (typeof value !== "string" || value.length === 0) {
    throw adxFileError(file, `Missing required field "${field}"`);
  }
  return value;
}

function optionalString(
  obj: Record<string, unknown>,
  field: string,
  file: string,
): string | undefined {
  if (!(field in obj) || obj[field] === undefined) return undefined;
  const value = obj[field];
  if (typeof value !== "string") {
    throw adxFileError(file, `Field "${field}" must be a string`);
  }
  return value;
}

function validateComponents(value: unknown, file: string): PageComponent[] {
  if (value === undefined || value === null) {
    throw adxFileError(file, `Missing required field "components"`);
  }
  if (!Array.isArray(value)) {
    throw adxFileError(
      file,
      `"components" must list at least one component`,
    );
  }
  if (value.length === 0) {
    throw adxFileError(
      file,
      `"components" must list at least one component`,
    );
  }
  return value.map((entry) => validateComponent(entry, file));
}

function validateComponent(value: unknown, file: string): PageComponent {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw adxFileError(file, `Each component must be an object with "use"`);
  }
  const obj = value as Record<string, unknown>;
  const use = obj.use;
  if (typeof use !== "string" || use.length === 0) {
    throw adxFileError(file, `Missing required field "use"`);
  }
  const component: PageComponent = { use };
  if ("data" in obj && obj.data !== undefined) {
    const d = obj.data;
    if (typeof d !== "object" || d === null || Array.isArray(d)) {
      throw adxFileError(file, `Component "data" must be an object of props`);
    }
    component.data = d as Record<string, unknown>;
  }
  return component;
}
