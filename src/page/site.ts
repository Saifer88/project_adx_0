/**
 * Site-config loader + validator.
 *
 * A site config is an optional JSON file passed explicitly via
 * `adx build/check <page.json> --site <path>`. It provides `assets` defaults
 * merged ahead of each page's own `assets`, plus an optional site-wide `lang`
 * default used only when a page omits `lang`. There is NO implicit discovery:
 * a page build behaves identically to today unless `--site` is passed.
 *
 * Errors use the canonical `[ADX] <site-file> - <message>` shape via
 * {@link adxFileError}, labeled with the site path the author named. The
 * `assets` schema (and its exact messages) is shared with the page loader
 * through {@link validateAssets}, so page and site assets validate identically.
 */

import { readFileSync } from "node:fs";
import { adxFileError } from "../errors.js";
import { validateAssets } from "./load.js";
import type { SiteConfig } from "./types.js";

/** Load + validate a site config from disk. `path` labels every error. */
export function loadSite(path: string): SiteConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw adxFileError(path, "Cannot read site config");
  }
  return parseSite(raw, path);
}

/** Parse + validate a site config from raw JSON text (loader + tests). */
export function parseSite(raw: string, file: string): SiteConfig {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw adxFileError(file, "Invalid JSON");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw adxFileError(file, "Site config must be an object");
  }
  const obj = data as Record<string, unknown>;

  const config: SiteConfig = {};

  const assets = validateAssets(obj.assets, file);
  if (assets !== undefined) {
    config.assets = assets;
  }

  if (obj.lang !== undefined) {
    if (typeof obj.lang !== "string") {
      throw adxFileError(file, `Field "lang" must be a string`);
    }
    config.lang = obj.lang;
  }

  if (obj.baseUrl !== undefined) {
    if (typeof obj.baseUrl !== "string" || obj.baseUrl.length === 0) {
      throw adxFileError(file, `Field "baseUrl" must be a non-empty string`);
    }
    // An absolute http(s) origin only: a relative/path-only value, a missing
    // host, or a non-web scheme (ftp:, mailto:) is rejected. The raw value is
    // stored verbatim; trailing slashes are normalized only at emit time.
    let parsed: URL;
    try {
      parsed = new URL(obj.baseUrl);
    } catch {
      throw adxFileError(file, "invalid baseUrl");
    }
    if (
      parsed.host.length === 0 ||
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    ) {
      throw adxFileError(
        file,
        "invalid baseUrl (must be an absolute http(s) origin)",
      );
    }
    config.baseUrl = obj.baseUrl;
  }

  return config;
}
