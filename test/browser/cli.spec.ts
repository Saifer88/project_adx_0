import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";

let directory: string;
let server: Server;
let origin: string;
const cli = resolve("dist/cli.js");
const tokens = resolve("tokens/design-tokens.json");
const payload = '</script><script>globalThis.injected=true</script>';

function writeComponent(path: string, name: string, step: number): void {
  mkdirSync(path, { recursive: true });
  writeFileSync(join(path, "manifest.json"), JSON.stringify({ name, version: "1", props: {
    count: { type: "number", default: 0 }, label: { type: "string", default: name },
    show: { type: "boolean", default: false }, active: { type: "boolean", default: false },
    items: { type: "array", default: ["A", "B"] },
  } }));
  writeFileSync(join(path, "structure.adx"), '<section><h2>{{label}}</h2><p :if="show">{{label}}</p><button .increment @click="onInc">{{count}}</button><input type="checkbox" :checked="active"><input .name :value="label"><button .toggle :disabled="active" @click="onToggle">Toggle</button><ul><li :for="item in items"><span>{{item}}</span></li></ul></section>');
  writeFileSync(join(path, "behavior.adx.js"), `export function setup(props){return {...props}}
export function onInc(state){state.count += ${step};state.items[0]="Changed"}
export function onToggle(state){state.active=true;state.label="updated"}`);
  writeFileSync(join(path, "style.adx.css"), "section { padding: 8px; }");
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
  await section.locator(".toggle").click();
  await expect(checkbox).toBeChecked();
  await expect(section.locator(".name")).toHaveValue("updated");
  await expect(section.locator(".toggle")).toBeDisabled();
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
    const metadata = await page.locator('[type="application/ld+json"]').textContent();
    expect(JSON.parse(metadata!).name).toBe(payload);
    await expect(page.locator("script")).toHaveCount(2);
  } finally {
    await context.close();
  }
});