import { describe, it, expect } from "vitest";
import {
  cleanPathForSlug,
  normalizeBase,
  escapeXml,
  buildSitemap,
  buildRobots,
} from "../src/page/crawl.js";

describe("cleanPathForSlug — slug-derived clean path", () => {
  it("maps index/home to the site root", () => {
    expect(cleanPathForSlug("index")).toBe("/");
    expect(cleanPathForSlug("home")).toBe("/");
  });

  it("maps any other slug to /<slug>/", () => {
    expect(cleanPathForSlug("about")).toBe("/about/");
    expect(cleanPathForSlug("blog-post")).toBe("/blog-post/");
  });
});

describe("normalizeBase — shared trailing-slash rule", () => {
  it("strips one or more trailing slashes", () => {
    expect(normalizeBase("https://example.com")).toBe("https://example.com");
    expect(normalizeBase("https://example.com/")).toBe("https://example.com");
    expect(normalizeBase("https://example.com///")).toBe("https://example.com");
  });
});

describe("escapeXml", () => {
  it("escapes the five XML-significant characters", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});

describe("buildSitemap — sitemaps 0.9", () => {
  const base = "https://example.com";

  it("is well-formed with the 0.9 namespace and one escaped <loc> per path", () => {
    const xml = buildSitemap(base, ["/", "/about/"]);
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n')).toBe(true);
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/about/</loc>");
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    // exactly two <url> entries.
    expect((xml.match(/<url>/g) ?? []).length).toBe(2);
  });

  it("XML-escapes special characters in a loc", () => {
    const xml = buildSitemap(base, ["/a&b/"]);
    expect(xml).toContain("<loc>https://example.com/a&amp;b/</loc>");
    expect(xml).not.toContain("a&b");
  });

  it("trailing-slash base variants produce identical, non-double-slashed URLs", () => {
    const withSlash = buildSitemap("https://example.com/", ["/", "/about/"]);
    const noSlash = buildSitemap("https://example.com", ["/", "/about/"]);
    expect(withSlash).toBe(noSlash);
    // no `//` after the origin.
    expect(withSlash).not.toContain("<loc>https://example.com//");
  });

  it("emits a valid empty <urlset> for no paths", () => {
    const xml = buildSitemap(base, []);
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        "</urlset>\n",
    );
    expect(xml).not.toContain("<url>");
  });
});

describe("buildRobots — allow-all + absolute Sitemap:", () => {
  it("has the allow-all block and the absolute Sitemap: line", () => {
    const robots = buildRobots("https://example.com");
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
    expect(robots).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("uses the same normalized origin as the sitemap (no double slash)", () => {
    const withSlash = buildRobots("https://example.com/");
    const noSlash = buildRobots("https://example.com");
    expect(withSlash).toBe(noSlash);
    expect(withSlash).toContain("Sitemap: https://example.com/sitemap.xml");
    expect(withSlash).not.toContain("example.com//sitemap.xml");
  });
});
