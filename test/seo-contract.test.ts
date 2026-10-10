import { describe, it, expect } from "vitest";
import { compileComponent } from "../src/compile.js";
import { fixtureDir, tokensPath } from "./helpers.js";

// The fixture `name` prop is required with no default; supply it via `data`.
const opts = { tokensPath, data: { name: "Ada Lovelace" } };

describe("SEO contract — emitted HTML is crawlable without JS", () => {
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
});
