/**
 * Page-manifest types — the JSON contract for a crawlable page.
 *
 * A page is a flat JSON object that composes component instances into one
 * complete `index.html` per URL. It carries exactly the SEO metadata the
 * document wrapper needs and nothing more. Each component instance reuses the
 * Phase 1 `data` concept (the props for that instance).
 */

/**
 * One external `<script>` referenced by a page/site `assets.js` entry.
 *
 * Normalized form: the loader expands a shorthand string `"./app.js"` to
 * `{ src: "./app.js" }`, so every `PageAssets.js` entry is an object. `src`
 * and `type` are emitted as escaped attribute values; `defer`/`async` are
 * bare boolean attributes emitted only when `true`.
 */
export interface PageAssetScript {
  /** URL or page-relative path (required, non-empty, escaped as an attribute). */
  src: string;
  /** Optional `type` attribute (the useful value is `"module"`), escaped. */
  type?: string;
  /** Emit the bare `defer` attribute when `true`. */
  defer?: boolean;
  /** Emit the bare `async` attribute when `true`. */
  async?: boolean;
}

/**
 * External design-library assets declared on a page manifest and/or the site
 * config. Normalized: arrays are always present (possibly empty) and `js`
 * entries are always objects. `css` links and raw `head` snippets go in
 * `<head>`; `js` scripts go after the hydration glue, before `</body>`.
 */
export interface PageAssets {
  /** External stylesheet hrefs, emitted as `<link rel="stylesheet">`. */
  css: string[];
  /** External scripts, emitted after the glue module. */
  js: PageAssetScript[];
  /** Raw `<head>` snippets, injected verbatim (author-trusted, NOT escaped). */
  head: string[];
}

/**
 * A validated site config (loaded via `adx build/check <page> --site <path>`).
 * Provides `assets` defaults merged ahead of each page's own assets, and an
 * optional site-wide `lang` default used only when a page omits `lang`.
 */
export interface SiteConfig {
  /** Site-wide asset defaults (same shape/validation as page `assets`). */
  assets?: PageAssets;
  /** Default `<html lang>` when a page did not explicitly set `lang`. */
  lang?: string;
  /**
   * Absolute `http(s)` origin for the site, e.g. `https://example.com`. When
   * set, a page build emits `sitemap.xml` + `robots.txt` into the output root;
   * when absent, neither file is generated and page output is unchanged. The
   * raw value is stored verbatim (trailing slashes normalized only at emit).
   */
  baseUrl?: string;
}

/** One component instance placed on a page, in DOM order within `<main>`. */
export interface PageComponent {
  /** Path to a component directory, relative to the page manifest's own dir. */
  use: string;
  /** The props for this instance (same shape as a `--data` file). */
  data?: Record<string, unknown>;
}

/** A validated page manifest. */
export interface PageManifest {
  /** URL slug (lowercase, hyphenated). `index`/`home` map to the site root. */
  page: string;
  /** `<title>` + OG/Twitter title. */
  title: string;
  /** Meta description + OG/Twitter description. */
  description: string;
  /** `<html lang>`; defaults to `"en"`. */
  lang: string;
  /** Canonical URL; defaults to `/` for the root page else `/<page>/`. */
  canonical: string;
  /** schema.org `@type` for a JSON-LD block (optional, schema-gated). */
  schema?: string;
  /** External design-library assets (css/js/head), present only when declared. */
  assets?: PageAssets;
  /**
   * Loader-internal: `true` iff the parsed JSON carried a string `lang` key.
   * Used solely by the site-merge to decide whether a site `lang` default
   * applies; never emitted.
   */
  langExplicit?: boolean;
  /** Ordered component instances. */
  components: PageComponent[];
}
