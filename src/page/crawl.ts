/**
 * Crawl-infrastructure emitter: `sitemap.xml` + `robots.txt`.
 *
 * SEO is a first-class ADX goal, so a build with a configured site `baseUrl`
 * emits a valid sitemap (sitemaps 0.9) and an allow-all robots.txt pointing at
 * it. Everything here is pure and filesystem-free except {@link emitCrawlFiles},
 * the single I/O seam the CLI calls. The clean URL path for a page is derived
 * from its SLUG (never the author-overridable `canonical`), mirroring the
 * output-path rule in `runPage` so the sitemap always matches what is written.
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The clean URL path for a page slug: `index`/`home` map to the site root `/`,
 * every other slug to `/<slug>/`. Mirrors `runPage`'s output-path rule and is
 * derived from the slug — NOT the author-overridable `page.canonical`.
 */
export function cleanPathForSlug(slug: string): string {
  return slug === "index" || slug === "home" ? "/" : `/${slug}/`;
}

/**
 * Strip trailing slashes from a base URL so it joins cleanly with a leading-
 * slash path. The single shared trailing-slash rule used by both emitters, so
 * `https://example.com` and `https://example.com/` yield identical output.
 */
export function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/** Escape the five XML-significant characters for safe use in text/attributes. */
export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Build a sitemaps 0.9 document: one XML-escaped `<loc>` per clean path,
 * absolute against the normalized base. An empty `cleanPaths` yields a valid
 * empty `<urlset>`.
 */
export function buildSitemap(baseUrl: string, cleanPaths: string[]): string {
  const base = normalizeBase(baseUrl);
  const urls = cleanPaths
    .map((path) => `  <url>\n    <loc>${escapeXml(base + path)}</loc>\n  </url>\n`)
    .join("");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls +
    `</urlset>\n`
  );
}

/**
 * Build an allow-all robots.txt with an absolute `Sitemap:` line pointing at
 * `<base>/sitemap.xml` (same normalized base as {@link buildSitemap}).
 */
export function buildRobots(baseUrl: string): string {
  const base = normalizeBase(baseUrl);
  return [
    "User-agent: *",
    "Allow: /",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}

/**
 * Write `sitemap.xml` then `robots.txt` into `outDir` for the given base and
 * clean paths. The only I/O in this module; the CLI calls it from the build
 * branch when a site `baseUrl` is configured.
 */
export function emitCrawlFiles(
  outDir: string,
  baseUrl: string,
  cleanPaths: string[],
): void {
  writeFileSync(join(outDir, "sitemap.xml"), buildSitemap(baseUrl, cleanPaths), "utf8");
  writeFileSync(join(outDir, "robots.txt"), buildRobots(baseUrl), "utf8");
}
