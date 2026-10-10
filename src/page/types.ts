/**
 * Page-manifest types — the JSON contract for a crawlable page.
 *
 * A page is a flat JSON object that composes component instances into one
 * complete `index.html` per URL. It carries exactly the SEO metadata the
 * document wrapper needs and nothing more. Each component instance reuses the
 * Phase 1 `data` concept (the props for that instance).
 */

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
  /** Ordered component instances. */
  components: PageComponent[];
}
