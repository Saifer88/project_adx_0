/**
 * Manifest loader + validator.
 *
 * Reads `<dir>/manifest.json`, validates the required fields and the shapes of
 * props/emits/slots/deps, and passes optional SEO metadata through. All errors
 * use the line-less format: `[ADX] manifest.json - <message>`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adxFileError } from "../errors.js";
import type { Manifest, PropDef, PropType, SeoMeta } from "./types.js";

const FILE = "manifest.json";
const PROP_TYPES: ReadonlySet<string> = new Set([
  "string",
  "number",
  "boolean",
  "array",
  "object",
]);

/** Load and validate the manifest in `dir`. Throws AdxError on any problem. */
export function loadManifest(dir: string): Manifest {
  return parseManifest(readFileSync(join(dir, FILE), "utf8"));
}

/** Parse + validate a manifest from raw JSON text (used by loader and tests). */
export function parseManifest(raw: string): Manifest {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw adxFileError(FILE, "Invalid JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw adxFileError(FILE, "Manifest must be a JSON object");
  }
  const obj = data as Record<string, unknown>;

  const name = requireString(obj, "name");
  const version = requireString(obj, "version");

  return {
    name,
    version,
    props: validateProps(obj.props),
    emits: validateStringArray(obj.emits, "emits"),
    slots: validateStringArray(obj.slots, "slots"),
    deps: validateStringArray(obj.deps, "deps"),
    seo: validateSeo(obj.seo),
  };
}

function requireString(obj: Record<string, unknown>, field: string): string {
  if (!(field in obj) || obj[field] === undefined) {
    throw adxFileError(FILE, `Missing required field "${field}"`);
  }
  const value = obj[field];
  if (typeof value !== "string" || value.length === 0) {
    throw adxFileError(FILE, `Field "${field}" must be a non-empty string`);
  }
  return value;
}

function validateProps(value: unknown): Record<string, PropDef> {
  if (value === undefined) return {};
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw adxFileError(FILE, `Field "props" must be an object`);
  }
  const out: Record<string, PropDef> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw adxFileError(FILE, `Prop "${key}" must be an object`);
    }
    const def = raw as Record<string, unknown>;
    const type = def.type;
    if (typeof type !== "string" || !PROP_TYPES.has(type)) {
      throw adxFileError(
        FILE,
        `Prop "${key}" has invalid type "${String(type)}"`,
      );
    }
    const prop: PropDef = { type: type as PropType };
    if ("required" in def) {
      if (typeof def.required !== "boolean") {
        throw adxFileError(FILE, `Prop "${key}" field "required" must be a boolean`);
      }
      prop.required = def.required;
    }
    if ("default" in def) {
      prop.default = def.default;
    }
    out[key] = prop;
  }
  return out;
}

function validateStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw adxFileError(FILE, `Field "${field}" must be an array of strings`);
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw adxFileError(FILE, `Field "${field}" must be an array of strings`);
    }
  }
  return value as string[];
}

function validateSeo(value: unknown): SeoMeta | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw adxFileError(FILE, `Field "seo" must be an object`);
  }
  const obj = value as Record<string, unknown>;
  const seo: SeoMeta = {};
  for (const key of ["title", "description", "schema"] as const) {
    if (key in obj && obj[key] !== undefined) {
      if (typeof obj[key] !== "string") {
        throw adxFileError(FILE, `SEO field "${key}" must be a string`);
      }
      seo[key] = obj[key] as string;
    }
  }
  return seo;
}
