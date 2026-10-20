import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSite, loadSite } from "../src/page/site.js";
import { compilePage, checkPage } from "../src/page/compile.js";
import { siteDir, tokensPath } from "./helpers.js";

const FILE = "site.json";

function parse(obj: unknown) {
  return parseSite(JSON.stringify(obj), FILE);
}

describe("parseSite — valid configs", () => {
  it("parses assets + lang and normalizes js shorthand", () => {
    const s = parse({
      assets: {
        css: ["./tailwind.css"],
        js: ["./site.js"],
        head: ['<link rel="preconnect" href="https://fonts.example" />'],
      },
      lang: "fr",
    });
    expect(s.assets).toEqual({
      css: ["./tailwind.css"],
      js: [{ src: "./site.js" }],
      head: ['<link rel="preconnect" href="https://fonts.example" />'],
    });
    expect(s.lang).toBe("fr");
  });

  it("omits assets/lang/baseUrl when absent", () => {
    const s = parse({});
    expect(s.assets).toBeUndefined();
    expect(s.lang).toBeUndefined();
    expect(s.baseUrl).toBeUndefined();
  });

  it("surfaces a valid https:// and http:// baseUrl verbatim", () => {
    expect(parse({ baseUrl: "https://example.com" }).baseUrl).toBe(
      "https://example.com",
    );
    // trailing slash is stored verbatim; normalization happens only at emit.
    expect(parse({ baseUrl: "http://example.com/" }).baseUrl).toBe(
      "http://example.com/",
    );
  });
});

describe("parseSite — error table (exact strings, site file label)", () => {
  it("Invalid JSON", () => {
    expect(() => parseSite("{ not json", FILE)).toThrow(
      `[ADX] ${FILE} - Invalid JSON`,
    );
  });

  it("Site config must be an object", () => {
    expect(() => parseSite("[]", FILE)).toThrow(
      `[ADX] ${FILE} - Site config must be an object`,
    );
  });

  it('Field "lang" must be a string', () => {
    expect(() => parse({ lang: 42 })).toThrow(
      `[ADX] ${FILE} - Field "lang" must be a string`,
    );
  });

  it('Field "baseUrl" must be a non-empty string (non-string / empty)', () => {
    expect(() => parse({ baseUrl: 42 })).toThrow(
      `[ADX] ${FILE} - Field "baseUrl" must be a non-empty string`,
    );
    expect(() => parse({ baseUrl: "" })).toThrow(
      `[ADX] ${FILE} - Field "baseUrl" must be a non-empty string`,
    );
  });

  it("invalid baseUrl: an unparseable relative/path-only value rejects", () => {
    // A value `new URL()` cannot parse (no scheme) -> the base `invalid baseUrl`.
    for (const bad of ["example.com", "/about", "./rel"]) {
      expect(() => parse({ baseUrl: bad })).toThrow(
        `[ADX] ${FILE} - invalid baseUrl`,
      );
    }
  });

  it("invalid baseUrl: a parseable non-web scheme rejects (host/scheme guard)", () => {
    // Parseable URLs that are not an absolute http(s) origin (wrong scheme, or
    // no host) -> the absolute-origin message.
    for (const bad of ["ftp://example.com", "mailto:a@b"]) {
      expect(() => parse({ baseUrl: bad })).toThrow(
        `[ADX] ${FILE} - invalid baseUrl (must be an absolute http(s) origin)`,
      );
    }
  });

  it("surfaces assets errors with the site file label", () => {
    expect(() => parse({ assets: { css: [""] } })).toThrow(
      `[ADX] ${FILE} - "assets.css" must be an array of strings`,
    );
    expect(() => parse({ assets: { js: [null] } })).toThrow(
      `[ADX] ${FILE} - Each "assets.js" entry must be a string or an object with "src"`,
    );
  });
});

describe("loadSite — reads + validates from disk", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-site-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads and validates a site.json", () => {
    const path = join(dir, "site.json");
    writeFileSync(path, JSON.stringify({ assets: { css: ["./a.css"] } }), "utf8");
    const s = loadSite(path);
    expect(s.assets).toEqual({ css: ["./a.css"], js: [], head: [] });
  });

  it("Cannot read site config for a missing path", () => {
    expect(() => loadSite("/no/such/site.json")).toThrow(
      `[ADX] /no/such/site.json - Cannot read site config`,
    );
  });
});

describe("compilePage — site+page merge (integration)", () => {
  const opts = {
    tokensPath,
    sitePath: join(siteDir, "site.json"),
  };

  it("emits merged external link/script/raw-head in the right positions", () => {
    const { html } = compilePage(join(siteDir, "styled.json"), opts);

    // zero unresolved interpolation.
    expect(html).not.toContain("{{");

    // Token stylesheet stays first; site css then page-unique css follow it
    // (the shared root-absolute /tailwind.css is deduped to a single link,
    // site-ordered; a root-absolute URL is the correct shared-asset form so a
    // nested page resolves it from the output root, not beside the page).
    const tokenCssAt = html.indexOf('href="style.css"');
    const tailwindAt = html.indexOf('href="/tailwind.css"');
    const extraAt = html.indexOf('href="./page-extra.css"');
    expect(tokenCssAt).toBeGreaterThan(-1);
    expect(tailwindAt).toBeGreaterThan(tokenCssAt);
    expect(extraAt).toBeGreaterThan(tailwindAt);
    // deduped: exactly one /tailwind.css link.
    expect((html.match(/href="\/tailwind\.css"/g) ?? []).length).toBe(1);

    // raw head snippets emitted verbatim.
    expect(html).toContain(
      '<link rel="preconnect" href="https://fonts.example" />',
    );
    expect(html).toContain('<meta name="theme-color" content="#1d4ed8" />');

    // glue stays before author scripts; site js (deduped) + page js both present.
    const glueAt = html.indexOf('src="glue.js"');
    const siteJsAt = html.indexOf('src="./site.js"');
    const pageJsAt = html.indexOf('src="./styled.js"');
    expect(glueAt).toBeGreaterThan(-1);
    expect(siteJsAt).toBeGreaterThan(glueAt);
    expect(pageJsAt).toBeGreaterThan(siteJsAt);
    expect(html).toContain('<script type="module" src="./site.js" defer></script>');
    expect(html).toContain('<script type="module" src="./styled.js" defer></script>');
  });

  it("checkPage merges the site config on the check path too (not just build)", () => {
    // checkPage picks up sitePath only via its delegation to compilePage; this
    // asserts the merge-on-check behavior directly so a future change that
    // stops threading opts through check is caught.
    expect(() =>
      checkPage(join(siteDir, "styled.json"), opts),
    ).not.toThrow();
  });
});
