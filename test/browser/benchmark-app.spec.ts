import { test, expect, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { once } from "node:events";
import { buildApp } from "../../benchmark/app/build.mjs";
import { pages } from "../../benchmark/app/pages.mjs";
import { parseArgs, serve } from "../../src/cli.js";

const origins: Record<string, string> = {};
const servers: Server[] = [];
let directory: string;

test.beforeAll(async () => {
  directory = mkdtempSync(join(tmpdir(), "adx-portal-browser-"));
  await buildApp(directory);
  for (const framework of ["adx", "react"]) {
    const server = serve({
      ...parseArgs(["serve", join(directory, framework)]),
      host: "127.0.0.1", port: 0,
    });
    servers.push(server);
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No portal server address");
    origins[framework] = `http://127.0.0.1:${address.port}`;
  }
});

test.afterAll(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((done, reject) => {
    server.close((error) => error ? reject(error) : done());
  })));
  if (directory) rmSync(directory, { recursive: true, force: true });
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth,
  )).toBe(true);
}

for (const framework of ["adx", "react"]) {
  test(`${framework}: all portal routes are complete and styled without JavaScript`, async ({ browser, viewport }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport });
    try {
      const page = await context.newPage();
      const errors = trackErrors(page);
      for (const model of pages) {
        const path = model.slug === "index" ? "/" : `/${model.slug}/`;
        await page.goto(origins[framework] + path);
        await expect(page).toHaveTitle(model.title);
        await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", model.description);
        await expect(page.locator("h1")).toHaveText(model.header.title);
        await expect(page.locator('nav a[aria-current="page"]')).toHaveText(
          model.header.section === "dashboard" ? "Overview" : "Tickets",
        );
        if (model.metrics) await expect(page.locator(".metric strong")).toHaveText(["1", "1", "1"]);
        if (model.list) {
          await expect(page.locator(".ticket-row a")).toHaveText(model.list.tickets.map((ticket) => ticket.subject));
          await expect(page.locator(".ticket-row .badge")).toHaveText(model.list.tickets.map((ticket) => ticket.status));
          await expect(page.locator(".ticket-row").first()).toHaveCSS("border-top-width", "1px");
          await expect(page.locator("q4")).toHaveCount(0);
        }
        if (model.ticket) {
          await expect(page.locator("#subject")).toHaveText(model.ticket.subject);
          await expect(page.getByRole("link", { name: model.ticket.email })).toHaveAttribute("href", `mailto:${model.ticket.email}`);
          await expect(page.getByLabel("Priority", { exact: true })).toHaveValue(model.ticket.priority);
          await expect(page.getByLabel("Response", { exact: true })).toHaveValue(model.ticket.draft);
        }
        await expect(page.locator("h1")).toHaveCSS("color", "rgb(23, 43, 58)");
        await expectNoOverflow(page);
      }
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test(`${framework}: navigation follows real links between dashboard, queue and detail`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(origins[framework]);
    await page.getByRole("link", { name: "Tickets", exact: true }).click();
    await expect(page).toHaveURL(`${origins[framework]}/tickets/`);
    await page.getByRole("link", { name: "Invoice export fails for monthly reports" }).click();
    await expect(page.locator("h1")).toHaveText("SUP-1042");
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.locator(".metric")).toHaveCount(3);
    expect(errors).toEqual([]);
  });

  test(`${framework}: priority and draft changes validate, save and reset on reload`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto(`${origins[framework]}/ticket-1042/`);
    const priority = page.getByLabel("Priority", { exact: true });
    const response = page.getByLabel("Response", { exact: true });
    const status = page.getByRole("status");
    await priority.selectOption("High");
    await expect(page.getByText("Current priority: High", { exact: true })).toBeVisible();
    await response.fill("   ");
    await page.getByRole("button", { name: "Save draft" }).click();
    await expect(status).toHaveText("Enter a response before saving.");
    await expect(response).toHaveAttribute("aria-invalid", "true");
    await response.fill('Resolved <script>alert("x")</script> & verified');
    await expect(response).toHaveAttribute("aria-invalid", "false");
    await response.press("Tab");
    await expect(page.getByRole("button", { name: "Save draft" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(status).toHaveText('Draft saved for SUP-1042 (High): Resolved <script>alert("x")</script> & verified');
    await expect(status.locator("script")).toHaveCount(0);
    await expectNoOverflow(page);
    await page.goto(`${origins[framework]}/ticket-1043/`);
    await expect(priority).toHaveValue("High");
    await expect(status).toHaveText("Draft not saved.");
    await page.goto(`${origins[framework]}/ticket-1042/`);
    await expect(priority).toHaveValue("Normal");
    await expect(response).toHaveValue("Thanks for reporting this. We are checking the export.");
    await expect(status).toHaveText("Draft not saved.");
    expect(errors).toEqual([]);
  });
}

test("ADX and React expose equivalent content, controls, links and layout", async ({ page }) => {
  const errors = trackErrors(page);
  for (const model of pages) {
    const snapshots = [];
    for (const framework of ["adx", "react"]) {
      const path = model.slug === "index" ? "/" : `/${model.slug}/`;
      await page.goto(origins[framework] + path);
      snapshots.push(await page.locator("main").evaluate((main: HTMLElement) => ({
        text: main.innerText.replace(/\s+/g, " ").trim(),
        headings: [...main.querySelectorAll("h1,h2")].map((element) => element.textContent),
        links: [...main.querySelectorAll("a")].map((element) => [element.textContent, element.getAttribute("href")]),
        controls: [...main.querySelectorAll("select,textarea")].map((element) => (element as HTMLInputElement).value),
        badges: [...main.querySelectorAll(".badge")].map((element) => element.textContent),
        rowPadding: [...main.querySelectorAll(".ticket-row")].map((element) => getComputedStyle(element).paddingTop),
      })));
    }
    expect(snapshots[0]).toEqual(snapshots[1]);
  }
  expect(errors).toEqual([]);
});

test("both portals fit a 375px viewport with enlarged text", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const framework of ["adx", "react"]) {
    for (const model of pages) {
      const path = model.slug === "index" ? "/" : `/${model.slug}/`;
      await page.goto(origins[framework] + path);
      await page.evaluate(() => { document.documentElement.style.fontSize = "150%"; });
      await expectNoOverflow(page);
      await expect(page.locator("h1")).toBeVisible();
      if (model.ticket) {
        await expect(page.getByLabel("Response", { exact: true })).toBeVisible();
        const button = page.getByRole("button", { name: "Save draft" });
        const bounds = await button.boundingBox();
        if (!bounds) throw new Error("Save draft button has no layout bounds");
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
    }
  }
});
