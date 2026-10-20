import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { pages } from "./pages.mjs";

const source = dirname(fileURLToPath(import.meta.url));
const root = resolve(source, "../..");
const cli = join(root, "dist/cli.js");
const tokens = join(root, "tokens/design-tokens.json");
const escape = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function buildApp(output) {
  const out = resolve(output);
  const temporary = mkdtempSync(join(root, "dist/portal-build-"));
  try {
    for (const framework of ["adx", "react"]) {
      mkdirSync(join(out, framework), { recursive: true });
      copyFileSync(join(source, "style.css"), join(out, framework, "app.css"));
    }
    const serverFile = join(temporary, "react-server.mjs");
    await build({
      entryPoints: [join(source, "react/App.jsx")], outfile: serverFile,
      bundle: true, platform: "node", format: "esm", jsx: "automatic",
      packages: "external",
    });
    const { App } = await import(pathToFileURL(serverFile).href);
    await build({
      entryPoints: [join(source, "react/client.jsx")], outfile: join(out, "react/client.js"),
      bundle: true, platform: "browser", format: "esm", jsx: "automatic", minify: true,
      define: { "process.env.NODE_ENV": '"production"' },
    });
    for (const page of pages) {
      const components = [{ use: join(source, "adx/header"), data: page.header }];
      if (page.metrics) components.push({ use: join(source, "adx/metrics"), data: { metrics: page.metrics } });
      if (page.list) components.push({ use: join(source, "adx/ticket-list"), data: page.list });
      if (page.ticket) components.push({ use: join(source, "adx/ticket-detail"), data: { ticket: page.ticket } });
      const manifest = join(temporary, `${page.slug}.json`);
      writeFileSync(manifest, JSON.stringify({
        page: page.slug, title: page.title, description: page.description,
        assets: { css: ["/app.css"] }, components,
      }));
      execFileSync(process.execPath, [cli, "build", manifest, "--tokens", tokens, "--out", join(out, "adx")]);
      const directory = page.slug === "index" ? join(out, "react") : join(out, "react", page.slug);
      mkdirSync(directory, { recursive: true });
      const data = JSON.stringify(page).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e").replaceAll("&", "\\u0026");
      writeFileSync(join(directory, "index.html"), `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}">
<link rel="stylesheet" href="/app.css"></head><body>
<main>${renderToString(createElement(App, { page }))}</main>
<script type="application/json" id="page-data">${data}</script>
<script type="module" src="/client.js"></script></body></html>\n`);
    }
    return out;
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 3) throw new Error("Usage: node benchmark/app/build.mjs [output-directory]");
  const out = await buildApp(process.argv[2] ?? join(source, "dist"));
  console.log(`Built support portals in ${out}/{adx,react}`);
}
