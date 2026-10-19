import { describe, it, expect } from "vitest";
import { compileComponent } from "../src/compile.js";
import { wrapPageDocument } from "../src/page/compile.js";
import { JSDOM } from "jsdom";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixtureDir, tokensPath } from "./helpers.js";

// The fixture `name` prop is required with no default; supply it via `data`.
const opts = { tokensPath, data: { name: "Ada Lovelace" } };

describe("SEO contract — emitted HTML is crawlable without JS", () => {
  it("preserves JSON-LD data without allowing script breakouts in pages or components", () => {
    const payload = '</script><script>alert("test")</script>';
    const pageHtml = wrapPageDocument([], { page: "index", title: payload, description: "Test", lang: "en", canonical: "/", schema: payload, components: [] });
    const dir = mkdtempSync(join(tmpdir(), "adx-seo-"));
    try {
      cpSync(fixtureDir, dir, { recursive: true });
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      manifest.name = payload;
      manifest.seo = { schema: payload };
      writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
      const componentHtml = compileComponent(dir, opts).html;
      for (const html of [pageHtml, componentHtml]) {
        const doc = new JSDOM(html).window.document;
        expect(doc.querySelectorAll("script").length).toBe(2);
        const metadata = JSON.parse(doc.querySelector('script[type="application/ld+json"]')!.textContent!);
        expect(metadata.name).toBe(payload);
        expect(metadata["@type"]).toBe(payload);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const { html } = compileComponent(fixtureDir, opts);

  it("contains the resolved content with zero {{", () => {
    expect(html).not.toContain("{{");
    // role default "User" is resolved into the markup.
    expect(html).toContain(">User<");
    // The required `name` is resolved into a non-empty <h2>.
    expect(html).toMatch(/<h2[^>]*>Ada Lovelace<\/h2>/);
  });

  it("emits required metadata and lang", () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toContain("<title>UserCard</title>");
    expect(html).toContain('<meta name="description"');
    expect(html).toContain('<link rel="canonical"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('name="twitter:card"');
  });

  it("uses semantic structure in correct order", () => {
    expect(html).toContain("<main>");
    expect(html).toContain("<article");
    // Single h2 within the component (no heading-level skip from an absent h1
    // within the component body is acceptable; the component is a fragment).
    expect((html.match(/<h2\b/g) ?? []).length).toBe(1);
  });

  it("loads the glue as a deferred module, not a blocking head script", () => {
    expect(html).toContain('<script type="module" src="glue.js"></script>');
    const headEnd = html.indexOf("</head>");
    const scriptAt = html.indexOf('src="glue.js"');
    expect(scriptAt).toBeGreaterThan(headEnd);
  });

  it("external assets stay SEO-safe: no {{, glue before author js, head verbatim, href escaped", () => {
    const assetsHtml = wrapPageDocument(
      [],
      {
        page: "index",
        title: "T",
        description: "D",
        lang: "en",
        canonical: "/",
        components: [],
      },
      {
        css: ['https://cdn.example/lib.css?a=1&b="x"'],
        js: [{ src: "./author.js", type: "module", defer: true }],
        head: ['<meta name="theme-color" content="#1d4ed8" />'],
      },
    );

    // Assets introduce no unresolved interpolation.
    expect(assetsHtml).not.toContain("{{");

    // The glue module still sits after </head> and BEFORE the author script, so
    // ADX's hydration is never blocked or reordered by an author asset.
    const headEnd = assetsHtml.indexOf("</head>");
    const glueAt = assetsHtml.indexOf('src="glue.js"');
    const authorAt = assetsHtml.indexOf('src="./author.js"');
    expect(glueAt).toBeGreaterThan(headEnd);
    expect(glueAt).toBeLessThan(authorAt);

    // Raw head is emitted verbatim; the css href attribute value is escaped.
    expect(assetsHtml).toContain(
      '<meta name="theme-color" content="#1d4ed8" />',
    );
    expect(assetsHtml).toContain(
      'href="https://cdn.example/lib.css?a=1&amp;b=&quot;x&quot;"',
    );
  });
});
