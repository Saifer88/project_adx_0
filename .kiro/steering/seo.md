# SEO & Crawlability

SEO-crawlability is a first-class ADX goal, on equal footing with token efficiency. Compiler output and components must be fully indexable by search engines and AI crawlers with zero JavaScript execution.

## Core rule: content in the HTML, not injected by JS

The compiler emits real static HTML with all meaningful content already present in the markup. Interpolations (`{{var}}`) are resolved into the emitted HTML at build time, not written into the DOM by a script on load. The per-component glue script then **hydrates** that existing HTML — attaching events and updating bindings on interaction — rather than constructing the DOM from scratch.

Consequence: a crawler (or a `curl`) that never runs JS still sees the complete, accurate content.

## Requirements

- **Static-first render**: every page/component compiles to complete HTML. JS enhances; it is never required to see content.
- **Semantic HTML**: use correct elements (`<main>`, `<nav>`, `<article>`, `<h1>`-`<h6>` in order, `<button>`, `<a href>`). One `<h1>` per page; headings never skip levels.
- **Metadata**: every page emits `<title>`, `<meta name="description">`, canonical URL, Open Graph and Twitter card tags, and `lang` on `<html>`.
- **Structured data**: emit JSON-LD (`application/ld+json`) where a page maps to a schema.org type (Article, Product, Organization, BreadcrumbList, etc.).
- **Crawl infrastructure**: build generates `sitemap.xml` and `robots.txt`. Internal links are real `<a href>` with crawlable URLs — no JS-only navigation.
- **Images**: real `<img>` with `alt`, `width`/`height` (no layout shift), and `loading="lazy"` below the fold.
- **Performance (ranking signal)**: minimal/no runtime JS, no layout shift (CLS), fast first paint. Per-component glue stays tiny; no blocking scripts in `<head>`.
- **URLs**: clean, lowercase, hyphenated, stable.

## How this maps to ADX files
- `structure.adx` -> semantic elements and heading order; content is build-time rendered.
- `manifest.json` -> may declare per-component/page SEO metadata (title, description, schema type).
- Compiler -> resolves interpolations into static HTML, emits metadata/JSON-LD, generates sitemap/robots, and produces hydration-only glue.

## Verification
When UI/pages are built, confirm crawlability by checking the raw compiled HTML (before JS) contains the real content, correct heading structure, and metadata — do not assume; inspect the emitted file.
