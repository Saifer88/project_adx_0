import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compilePage,
  checkPage,
  wrapPageDocument,
  mergeAssets,
} from "../src/page/compile.js";
import type { PageManifest } from "../src/page/types.js";
import { fixtureDir, siteDir, tokensPath } from "./helpers.js";

const opts = { tokensPath };

/** A minimal page manifest for direct wrapPageDocument emission tests. */
const PAGE: PageManifest = {
  page: "p",
  title: "P",
  description: "D",
  lang: "en",
  canonical: "/p/",
  components: [],
};

describe("compilePage — two-page fixture site", () => {
  it("assigns stable distinct assets to same-basename components", () => {
    const dir = mkdtempSync(join(tmpdir(), "adx-assets-"));
    try {
      const paths = [join(dir, "first", "card"), join(dir, "second", "card")];
      for (const path of paths) cpSync(fixtureDir, path, { recursive: true });
      const pageFile = join(dir, "index.json");
      writeFileSync(pageFile, JSON.stringify({ page: "index", title: "Pair", description: "Pair", components: paths.map((use) => ({ use, data: { name: use } })) }));
      const result = compilePage(pageFile, opts);
      expect(new Set(result.components.map((component) => component.stem)).size).toBe(2);
      expect(compilePage(pageFile, opts).components).toEqual(result.components);
      for (const component of result.components) {
        expect(result.glue).toContain(`import "./${component.stem}.glue.js";`);
        expect(component.glue).toContain(`from "./${component.stem}.behavior.js";`);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  const index = compilePage(join(siteDir, "index.json"), opts);
  const about = compilePage(join(siteDir, "about.json"), opts);

  it("resolves all content with zero {{ left", () => {
    expect(index.html).not.toContain("{{");
    expect(about.html).not.toContain("{{");
  });

  it("concatenates component bodies in DOM order inside one <main>", () => {
    expect(index.html).toContain("<main>");
    // site-header appears before user-card (manifest order).
    const headerAt = index.html.indexOf("ADX Demo");
    const cardAt = index.html.indexOf("Ada Lovelace");
    expect(headerAt).toBeGreaterThan(-1);
    expect(cardAt).toBeGreaterThan(headerAt);
  });

  it("renders each instance's resolved content", () => {
    expect(index.html).toMatch(/<h2[^>]*>Ada Lovelace<\/h2>/);
    expect(index.html).toContain("Current page: home");
    expect(about.html).toMatch(/<h2[^>]*>Grace Hopper<\/h2>/);
    expect(about.html).toContain("Current page: about");
  });

  it("emits the per-page title/description", () => {
    expect(index.html).toContain("<title>ADX Demo — Home</title>");
    expect(index.html).toContain(
      '<meta name="description" content="The home page of the ADX two-page demo site." />',
    );
    expect(about.html).toContain("<title>About us</title>");
    expect(about.html).toContain(
      '<meta name="description" content="Who we are and what ADX is." />',
    );
  });

  it("derives the correct per-page canonical from the slug", () => {
    // index/home -> root canonical.
    expect(index.html).toContain('<link rel="canonical" href="/" />');
    // explicit canonical on the about page.
    expect(about.html).toContain('<link rel="canonical" href="/about/" />');
  });

  it("sets <html lang> per page", () => {
    expect(index.html).toContain('<html lang="en">');
    expect(about.html).toContain('<html lang="en">');
  });

  it("emits page JSON-LD with @type == schema and name == title", () => {
    const indexLd = JSON.parse(
      /<script type="application\/ld\+json">(.*?)<\/script>/.exec(index.html)![1],
    );
    expect(indexLd["@type"]).toBe("WebPage");
    expect(indexLd.name).toBe("ADX Demo — Home");

    const aboutLd = JSON.parse(
      /<script type="application\/ld\+json">(.*?)<\/script>/.exec(about.html)![1],
    );
    expect(aboutLd["@type"]).toBe("AboutPage");
    expect(aboutLd.name).toBe("About us");
  });

  it("unions each distinct component's scoped CSS and emits sidecar assets", () => {
    expect(index.css).toContain('[data-adx-c="');
    // two distinct components used -> two glue sidecars.
    const stems = index.components.map((c) => c.stem).sort();
    expect(stems).toEqual(["site-header", "user-card"]);
    // page entry imports each component's module.
    expect(index.glue).toContain('import "./site-header.glue.js";');
    expect(index.glue).toContain('import "./user-card.glue.js";');
  });
});

describe("compilePage — JSON-LD omitted when schema absent", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-page-"));
    const page = {
      page: "plain",
      title: "Plain",
      description: "No schema here.",
      // Point `use` at the real fixture via an absolute path for determinism.
      components: [{ use: join(siteDir, "..", "user-card"), data: { name: "X" } }],
    };
    writeFileSync(join(dir, "plain.json"), JSON.stringify(page), "utf8");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("emits no JSON-LD block when page.schema is absent", () => {
    const { html } = compilePage(join(dir, "plain.json"), opts);
    expect(html).not.toContain("application/ld+json");
  });
});

describe("compilePage — Component not found", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-page-"));
    const page = {
      page: "broken",
      title: "Broken",
      description: "Bad use path.",
      components: [{ use: "./nope" }],
    };
    writeFileSync(join(dir, "broken.json"), JSON.stringify(page), "utf8");
    // A `use` pointing at a .json file is also "not found".
    const page2 = {
      page: "broken2",
      title: "Broken2",
      description: "Points at a json file.",
      components: [{ use: "./broken.json" }],
    };
    writeFileSync(join(dir, "broken2.json"), JSON.stringify(page2), "utf8");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("fails when a use points at a missing component dir", () => {
    expect(() => compilePage(join(dir, "broken.json"), opts)).toThrow(
      `[ADX] ${join(dir, "broken.json")} - Component not found: "./nope"`,
    );
  });

  it("fails when a use points at a .json file", () => {
    expect(() => compilePage(join(dir, "broken2.json"), opts)).toThrow(
      `[ADX] ${join(dir, "broken2.json")} - Component not found: "./broken.json"`,
    );
  });
});

describe("wrapPageDocument — assets emission (exact tag text)", () => {
  it("emits nothing extra when assets is undefined or all-empty", () => {
    const base = wrapPageDocument([], PAGE);
    expect(wrapPageDocument([], PAGE, { css: [], js: [], head: [] })).toBe(base);
    // The token stylesheet and glue script keep their exact text/position.
    expect(base).toContain('  <link rel="stylesheet" href="style.css" />\n</head>');
    expect(base).toContain(
      '  <script type="module" src="glue.js"></script>\n</body>',
    );
  });

  it("emits external css AFTER the token style.css link, escaping the href", () => {
    const html = wrapPageDocument([], PAGE, {
      css: ["./tailwind.css", '"></head>'],
      js: [],
      head: [],
    });
    expect(html).toContain(
      '  <link rel="stylesheet" href="style.css" />\n' +
        '  <link rel="stylesheet" href="./tailwind.css" />\n' +
        '  <link rel="stylesheet" href="&quot;&gt;&lt;/head&gt;" />\n' +
        "</head>",
    );
  });

  it("accepts a whitespace-only href and escapes it verbatim", () => {
    const html = wrapPageDocument([], PAGE, { css: ["  "], js: [], head: [] });
    expect(html).toContain('  <link rel="stylesheet" href="  " />\n</head>');
  });

  it("emits each js golden string in fixed attribute order, after the glue", () => {
    const cases: Array<[PageManifest["assets"] extends never ? never : unknown, string]> = [
      ["./widget.js", '<script src="./widget.js"></script>'],
      [{ src: "./app.js", type: "module" }, '<script type="module" src="./app.js"></script>'],
      [
        { src: "./app.js", type: "module", defer: true },
        '<script type="module" src="./app.js" defer></script>',
      ],
      [
        { src: "./a.js", type: "module", defer: true, async: true },
        '<script type="module" src="./a.js" defer async></script>',
      ],
      [{ src: "./a.js", async: true }, '<script src="./a.js" async></script>'],
    ];
    for (const [entry, expected] of cases) {
      // js entries are already-normalized objects on PageAssets, but the golden
      // shorthand string is normalized here to mirror the loader's output.
      const js =
        typeof entry === "string" ? [{ src: entry }] : [entry as { src: string }];
      const html = wrapPageDocument([], PAGE, { css: [], js, head: [] });
      expect(html).toContain(
        '  <script type="module" src="glue.js"></script>\n  ' + expected + "\n</body>",
      );
    }
  });

  it("escapes a hostile js src and type as attribute values", () => {
    const html = wrapPageDocument([], PAGE, {
      css: [],
      js: [{ src: '"></script><x href="&<>', type: '"><x>&' }],
      head: [],
    });
    expect(html).toContain(
      '  <script type="&quot;&gt;&lt;x&gt;&amp;" ' +
        'src="&quot;&gt;&lt;/script&gt;&lt;x href=&quot;&amp;&lt;&gt;"></script>\n' +
        "</body>",
    );
  });

  it("emits raw head verbatim (unescaped); empty string is just the indent line", () => {
    const html = wrapPageDocument([], PAGE, {
      css: [],
      js: [],
      head: ['<meta name="x" content="&unescaped">', ""],
    });
    expect(html).toContain(
      '  <link rel="stylesheet" href="style.css" />\n' +
        '  <meta name="x" content="&unescaped">\n' +
        "  \n" +
        "</head>",
    );
  });

  it("orders token css before external css, and glue before author js (all three)", () => {
    const html = wrapPageDocument([], PAGE, {
      css: ["./lib.css"],
      js: [{ src: "./app.js" }],
      head: ['<meta name="theme-color" content="#000" />'],
    });
    expect(html.indexOf('href="style.css"')).toBeLessThan(
      html.indexOf('href="./lib.css"'),
    );
    expect(html.indexOf('src="glue.js"')).toBeLessThan(
      html.indexOf('src="./app.js"'),
    );
  });
});

describe("mergeAssets — concat + dedupe", () => {
  it("site-only / page-only / missing sides", () => {
    const a = { css: ["./a.css"], js: [{ src: "./a.js" }], head: ["<x>"] };
    expect(mergeAssets(a, undefined)).toEqual(a);
    expect(mergeAssets(undefined, a)).toEqual(a);
    expect(mergeAssets(undefined, undefined)).toEqual({ css: [], js: [], head: [] });
  });

  it("dedupes css by exact string and js by src (first/site wins); head not deduped", () => {
    const site = {
      css: ["./tw.css", "./s.css"],
      js: [{ src: "./shared.js", defer: true }],
      head: ["<x>"],
    };
    const page = {
      css: ["./tw.css", "./p.css"],
      js: [{ src: "./shared.js", async: true }, { src: "./p.js" }],
      head: ["<x>", "<y>"],
    };
    const merged = mergeAssets(site, page);
    expect(merged.css).toEqual(["./tw.css", "./s.css", "./p.css"]);
    // first (site) wins on the shared src, flags included.
    expect(merged.js).toEqual([
      { src: "./shared.js", defer: true },
      { src: "./p.js" },
    ]);
    expect(merged.head).toEqual(["<x>", "<x>", "<y>"]);
  });
});

describe("compilePage — lang precedence with a site default", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-lang-"));
    writeFileSync(join(dir, "site.json"), JSON.stringify({ lang: "fr" }), "utf8");
    const base = {
      title: "T",
      description: "D",
      components: [{ use: join(siteDir, "..", "user-card"), data: { name: "X" } }],
    };
    writeFileSync(
      join(dir, "no-lang.json"),
      JSON.stringify({ page: "no-lang", ...base }),
      "utf8",
    );
    writeFileSync(
      join(dir, "explicit.json"),
      JSON.stringify({ page: "explicit", lang: "de", ...base }),
      "utf8",
    );
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("site lang fills in when the page omits lang", () => {
    const { html } = compilePage(join(dir, "no-lang.json"), {
      tokensPath,
      sitePath: join(dir, "site.json"),
    });
    expect(html).toContain('<html lang="fr">');
  });

  it("an explicit page lang wins over the site default", () => {
    const { html } = compilePage(join(dir, "explicit.json"), {
      tokensPath,
      sitePath: join(dir, "site.json"),
    });
    expect(html).toContain('<html lang="de">');
  });

  it("falls back to the page default (en) with no site config", () => {
    const { html } = compilePage(join(dir, "no-lang.json"), { tokensPath });
    expect(html).toContain('<html lang="en">');
  });
});

// Stored-golden byte-identity guard: these literals were captured from the
// PRE-feature build of the fixtures. Asserting the post-change build equals
// them catches any stray newline/indent/line-move in wrapPageDocument that a
// tautological live self-comparison would miss. If the wrapper's managed
// output legitimately changes, regenerate these literals deliberately.
const EXPECTED_INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ADX Demo — Home</title>
  <meta name="description" content="The home page of the ADX two-page demo site." />
  <link rel="canonical" href="/" />
  <meta property="og:title" content="ADX Demo — Home" />
  <meta property="og:description" content="The home page of the ADX two-page demo site." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="ADX Demo — Home" />
  <meta name="twitter:description" content="The home page of the ADX two-page demo site." />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"ADX Demo — Home"}</script>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <header class="site-header" data-adx-c="c467ef34" data-adx-i="i0"><h1 class="brand" data-adx-c="c467ef34" data-adx-b="c467ef34-i0-0">ADX Demo</h1><p class="current" data-adx-c="c467ef34" data-adx-b="c467ef34-i0-1">Current page: home</p><nav class="nav" data-adx-c="c467ef34"><slot class="nav-slot" data-adx-slot="" data-adx-c="c467ef34"></slot></nav></header>
    <article class="card" data-adx-c="c055454e" data-adx-i="i1" data-adx-b="c055454e-i1-0"><img class="avatar" src="/default.png" alt="Ada Lovelace" data-adx-c="c055454e" data-adx-b="c055454e-i1-1" /><div class="content" data-adx-c="c055454e"><h2 class="name" data-adx-c="c055454e" data-adx-b="c055454e-i1-2">Ada Lovelace</h2><p class="role" data-adx-c="c055454e" data-adx-b="c055454e-i1-3">Founder</p><p class="bio" data-adx-c="c055454e" data-adx-b="c055454e-i1-4">First programmer.</p></div><slot class="actions" data-adx-slot="actions" data-adx-c="c055454e"></slot></article>
  </main>
  <script type="module" src="glue.js"></script>
</body>
</html>
`;

const EXPECTED_ABOUT_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>About us</title>
  <meta name="description" content="Who we are and what ADX is." />
  <link rel="canonical" href="/about/" />
  <meta property="og:title" content="About us" />
  <meta property="og:description" content="Who we are and what ADX is." />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="About us" />
  <meta name="twitter:description" content="Who we are and what ADX is." />
  <script type="application/ld+json">{"@context":"https://schema.org","@type":"AboutPage","name":"About us"}</script>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <header class="site-header" data-adx-c="c467ef34" data-adx-i="i0"><h1 class="brand" data-adx-c="c467ef34" data-adx-b="c467ef34-i0-0">ADX Demo</h1><p class="current" data-adx-c="c467ef34" data-adx-b="c467ef34-i0-1">Current page: about</p><nav class="nav" data-adx-c="c467ef34"><slot class="nav-slot" data-adx-slot="" data-adx-c="c467ef34"></slot></nav></header>
    <article class="card" data-adx-c="c055454e" data-adx-i="i1" data-adx-b="c055454e-i1-0"><img class="avatar" src="/default.png" alt="Grace Hopper" data-adx-c="c055454e" data-adx-b="c055454e-i1-1" /><div class="content" data-adx-c="c055454e"><h2 class="name" data-adx-c="c055454e" data-adx-b="c055454e-i1-2">Grace Hopper</h2><p class="role" data-adx-c="c055454e" data-adx-b="c055454e-i1-3">Advisor</p><p class="bio" data-adx-c="c055454e" data-adx-b="c055454e-i1-4">Compiler pioneer.</p></div><slot class="actions" data-adx-slot="actions" data-adx-c="c055454e"></slot></article>
  </main>
  <script type="module" src="glue.js"></script>
</body>
</html>
`;

describe("compilePage — assets-free pages are byte-for-byte unchanged (stored golden)", () => {
  it("index.json matches the pre-feature golden", () => {
    expect(compilePage(join(siteDir, "index.json"), opts).html).toBe(
      EXPECTED_INDEX_HTML,
    );
  });

  it("about.json matches the pre-feature golden", () => {
    expect(compilePage(join(siteDir, "about.json"), opts).html).toBe(
      EXPECTED_ABOUT_HTML,
    );
  });
});

describe("checkPage — required-prop validation per instance (MEDIUM-6)", () => {
  const valid = { tokensPath };

  it("passes when every instance's required props are supplied", () => {
    expect(() => checkPage(join(siteDir, "index.json"), valid)).not.toThrow();
  });

  it("fails with the child's page-sourced Missing required prop error", () => {
    // Build a page whose user-card instance omits the required `name`.
    const dir = mkdtempSync(join(tmpdir(), "adx-page-"));
    try {
      const page = {
        page: "missing",
        title: "Missing",
        description: "A required prop is unsupplied.",
        components: [{ use: join(siteDir, "..", "user-card"), data: {} }],
      };
      writeFileSync(join(dir, "missing.json"), JSON.stringify(page), "utf8");
      expect(() => checkPage(join(dir, "missing.json"), valid)).toThrow(
        '[ADX] manifest.json - Missing required prop "name" (no default and no value in the page\'s component data)',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
