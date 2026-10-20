import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";

let directory: string;
let server: Server;
let origin: string;
const cli = resolve("dist/cli.js");
const tailwindCli = resolve("node_modules/@tailwindcss/cli/dist/index.mjs");
const tokens = resolve("tokens/design-tokens.json");
const payload = '</script><script>globalThis.injected=true</script>';

function writeComponent(path: string, name: string, step: number): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "manifest.json"), JSON.stringify({ name, version: "1", props: {
    count: { type: "number", default: 0 }, label: { type: "string", default: name },
    show: { type: "boolean", default: false }, active: { type: "boolean", default: false },
    items: { type: "array", default: ["A", "B"] },
  } }));
  writeFileSync(join(path, "structure.adx"), '<section><h2>{{label}}</h2><p :if="show">{{label}}</p><button .increment @click="onInc">{{count}}</button><input type="checkbox" :checked="active"><input .name :value="label"><button .toggle :disabled="active" @click="onToggle">Toggle</button><h3 .display @click="onToggle">{{displayName}}</h3><ul><li :for="item in items"><span>{{item}}</span></li></ul></section>');
  writeFileSync(join(path, "behavior.adx.js"), `export function setup(props){return {...props}}
export function getDisplayName(state){return state.label.toUpperCase()}
export function onInc(state){state.count += ${step};state.items[0]="Changed"}
export function onToggle(state){state.active=true;state.label="updated"}`);
  writeFileSync(join(path, "style.adx.css"), "section { padding: 8px; }");
}

function buildTailwindPages(out: string): void {
  const component = join(directory, "utility-card");
  const styles = join(directory, "styles");
  mkdirSync(component);
  mkdirSync(styles);
  symlinkSync(resolve("node_modules"), join(directory, "node_modules"), "junction");
  writeFileSync(join(component, "manifest.json"), JSON.stringify({ name: "UtilityCard", version: "1" }));
  writeFileSync(join(component, "behavior.adx.js"), "export function setup(){return {}}");
  writeFileSync(join(component, "structure.adx"), `<section class="utility-card p-2.5 md:grid gap-4">
  <p class="w-1/2">Tailwind content</p>
  <span class="block w-[37px] -mt-2">Arbitrary and negative values</span>
  <a href="#details" class="hover:underline">Read more</a>
  <p id="details" class="local-override p-4!">Explicit override</p>
</section>`);
  writeFileSync(join(component, "style.adx.css"), ".utility-card { pad: 24px; }\n.local-override { pad: 24px; }");

  for (const important of [false, true]) {
    const name = important ? "utilities-important" : "utilities";
    const cssName = `${name}.css`;
    const input = join(styles, cssName);
    writeFileSync(input, `@import "tailwindcss" source("../")${important ? " important" : ""};`);
    execFileSync(process.execPath, [tailwindCli, "-i", input, "-o", join(out, cssName), "--minify"], {
      cwd: directory,
      timeout: 30_000,
    });
    const siteFile = join(directory, `${name}-site.json`);
    writeFileSync(siteFile, JSON.stringify({ assets: { css: [`/${cssName}`] } }));
    const pageFile = join(directory, `${name}.json`);
    writeFileSync(pageFile, JSON.stringify({
      page: name, title: "Tailwind integration", description: "Real generated Tailwind CSS",
      assets: { css: [`/${cssName}`] }, components: [{ use: "./utility-card" }],
    }));
    execFileSync(process.execPath, [cli, "check", pageFile, "--site", siteFile, "--tokens", tokens]);
    execFileSync(process.execPath, [cli, "build", pageFile, "--site", siteFile, "--out", out, "--tokens", tokens]);
  }
}

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "adx-browser-"));
  const first = join(directory, "first", "counter");
  const second = join(directory, "second", "counter");
  writeComponent(first, "CounterA", 1);
  writeComponent(second, "CounterB", 2);
  const pageFile = join(directory, "index.json");
  writeFileSync(pageFile, JSON.stringify({ page: "index", title: payload, description: "Browser regression", schema: "WebPage", components: [
    { use: first, data: { count: 0 } },
    { use: first, data: { count: 10, show: true } },
    { use: second, data: { count: 20 } },
  ] }));
  const out = join(directory, "out");
  execFileSync(process.execPath, [cli, "build", pageFile, "--out", out, "--tokens", tokens]);
  const parent = join(directory, "parent");
  mkdirSync(parent);
  writeFileSync(join(parent, "manifest.json"), JSON.stringify({ name: "Parent", version: "1", deps: [first, second] }));
  writeFileSync(join(parent, "structure.adx"), "<div><counter-a /><counter-b /></div>");
  writeFileSync(join(parent, "behavior.adx.js"), "export function setup(){return {}}");
  writeFileSync(join(parent, "style.adx.css"), "div { display: block; }");
  execFileSync(process.execPath, [cli, "build", parent, "--out", out, "--tokens", tokens]);
  execFileSync(process.execPath, [cli, "check", "fixtures/user-card", "--data", "fixtures/user-card/data.json"]);
  buildTailwindPages(out);

  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    const target = resolve(out, `.${decodeURIComponent(pathname)}`, pathname.endsWith("/") ? "index.html" : "");
    if (!target.startsWith(out + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
      response.setHeader("Content-Type", types[extname(target)] ?? "application/octet-stream");
      response.end(readFileSync(target));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server) await new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done()));
  if (directory) rmSync(directory, { recursive: true, force: true });
});

test("page CLI output isolates state, hooks and same-basename assets", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("response", (response) => { if (response.status() >= 400) errors.push(response.url()); });
  await page.goto(origin);
  const buttons = page.locator(".increment");
  await buttons.nth(0).click();
  await expect(buttons).toHaveText(["1", "10", "20"]);
  await buttons.nth(1).click();
  await buttons.nth(2).click();
  await expect(buttons).toHaveText(["1", "11", "22"]);
  await expect(page.locator("li span")).toHaveText(["A", "B", "A", "B", "A", "B"]);
  expect(await page.evaluate(() => "injected" in globalThis)).toBe(false);
  expect(errors).toEqual([]);
});

test("form bindings update dirty properties and boolean attributes", async ({ page }) => {
  await page.goto(origin);
  const section = page.locator("section").first();
  const checkbox = section.locator('[type="checkbox"]');
  await checkbox.check();
  await checkbox.uncheck();
  await section.locator(".name").fill("edited");
  await expect(section.locator(".toggle")).toBeEnabled();
  // Computed node starts at its build-time value for THIS (first) instance.
  await expect(section.locator(".display")).toHaveText("COUNTERA");
  await section.locator(".toggle").click();
  await expect(checkbox).toBeChecked();
  await expect(section.locator(".name")).toHaveValue("updated");
  await expect(section.locator(".toggle")).toBeDisabled();
  // FEAT-001 runtime: onToggle set label="updated"; the computed {{displayName}}
  // re-evaluates getDisplayName over the live state for the clicked instance only.
  await expect(section.locator(".display")).toHaveText("UPDATED");
  // Other instances' computed nodes are untouched (per-instance isolation).
  await expect(page.locator(".display")).toHaveText(["UPDATED", "COUNTERA", "COUNTERB"]);
});

test("standalone composed children receive working modules", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/parent/`);
  const buttons = page.locator(".increment");
  await buttons.nth(0).click();
  await buttons.nth(1).click();
  await expect(buttons).toHaveText(["1", "2"]);
  expect(errors).toEqual([]);
});

test("content and metadata remain complete without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(origin);
    await expect(page.locator(".increment")).toHaveText(["0", "10", "20"]);
    await expect(page.locator("h2")).toHaveText(["CounterA", "CounterA", "CounterB"]);
    // SEO static-first: the computed {{displayName}} node carries its correct
    // build-time value with JS disabled (getDisplayName ran at build time).
    await expect(page.locator(".display")).toHaveText(["COUNTERA", "COUNTERA", "COUNTERB"]);
    const metadata = await page.locator('[type="application/ld+json"]').textContent();
    expect(JSON.parse(metadata!).name).toBe(payload);
    await expect(page.locator("script")).toHaveCount(2);
  } finally {
    await context.close();
  }
});

test("real Tailwind CSS styles nested pages without JavaScript and preserves cascade opt-in", async ({ browser, viewport }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport });
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("requestfailed", (request) => errors.push(request.url()));
    page.on("response", (response) => { if (response.status() >= 400) errors.push(response.url()); });
    for (const important of [false, true]) {
      const name = important ? "utilities-important" : "utilities";
      await page.goto(`${origin}/${name}/`);
      await expect(page.locator(`link[href="/${name}.css"]`)).toHaveCount(1);
      const card = page.locator(".utility-card");
      await expect(card).toHaveCSS("padding-top", important ? "10px" : "24px");
      await expect(card).toHaveCSS("display", (viewport?.width ?? 1280) >= 768 ? "grid" : "block");
      await expect(card).toHaveCSS("gap", "16px");
      await expect(card.locator("span")).toHaveCSS("width", "37px");
      await expect(card.locator("span")).toHaveCSS("margin-top", "-8px");
      await expect(page.locator(".local-override")).toHaveCSS("padding-top", "16px");
      await expect(card.locator("p").first()).toHaveText("Tailwind content");
      const halfWidth = await card.locator("p").first().evaluate((element) => {
        const parent = element.parentElement!;
        const parentStyle = getComputedStyle(parent);
        const contentWidth = parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight);
        return element.getBoundingClientRect().width / contentWidth;
      });
      expect(halfWidth).toBeCloseTo(0.5, 2);
      await card.locator("a").hover();
      await expect(card.locator("a")).toHaveCSS("text-decoration-line", "underline");
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
});