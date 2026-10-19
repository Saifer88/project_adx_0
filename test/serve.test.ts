import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest, type Server } from "node:http";
import { parseArgs, serve } from "../src/cli.js";

interface Res {
  status: number;
  type: string | undefined;
  body: string;
}

// Send `path` raw (not re-encoded) so traversal vectors reach the server
// exactly as written.
function request(port: number, path: string, method = "GET"): Promise<Res> {
  return new Promise((done, fail) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, path, method },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          done({
            status: res.statusCode ?? 0,
            type: res.headers["content-type"],
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("error", fail);
    req.end();
  });
}

describe("parseArgs serve options", () => {
  it("accepts serve with --port and --host", () => {
    const args = parseArgs(["serve", "public", "--port", "8080", "--host", "0.0.0.0"]);
    expect(args.command).toBe("serve");
    expect(args.dir).toBe("public");
    expect(args.port).toBe(8080);
    expect(args.host).toBe("0.0.0.0");
  });

  it("leaves port/host unset when omitted", () => {
    const args = parseArgs(["serve"]);
    expect(args.port).toBeUndefined();
    expect(args.host).toBeUndefined();
  });

  it("rejects an out-of-range or non-numeric --port by leaving it undefined", () => {
    expect(parseArgs(["serve", "--port", "70000"]).port).toBeUndefined();
    expect(parseArgs(["serve", "--port", "0"]).port).toBeUndefined();
    expect(parseArgs(["serve", "--port", "abc"]).port).toBeUndefined();
    expect(parseArgs(["serve", "--port", "3000"]).port).toBe(3000);
  });

  it("does NOT consume --port/--host for build/check (behavior-preserving)", () => {
    // Previously `adx build --host fixtures/user-card` ignored --host and used
    // the path as the positional dir; that must still hold.
    const built = parseArgs(["build", "--host", "fixtures/user-card"]);
    expect(built.host).toBeUndefined();
    expect(built.dir).toBe("fixtures/user-card");
    const checked = parseArgs(["check", "--port", "comp"]);
    expect(checked.port).toBeUndefined();
    expect(checked.dir).toBe("comp");
  });
});

describe("serve static file server", () => {
  let dir: string;
  let port: number;
  let server: Server;

  function start(): Promise<void> {
    server = serve(
      parseArgs(["serve", dir, "--port", String(port), "--host", "127.0.0.1"]),
    );
    return new Promise((done) => server.once("listening", () => done()));
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "adx-serve-"));
    writeFileSync(join(dir, "index.html"), "<h1>hello adx</h1>");
    writeFileSync(join(dir, "glue.js"), "export const x = 1;");
    port = 30000 + Math.floor(Math.random() * 20000);
  });

  afterEach(async () => {
    if (server?.listening) {
      await new Promise<void>((done) => server.close(() => done()));
    }
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves index.html for / with real content", async () => {
    await start();
    const res = await request(port, "/");
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html; charset=utf-8");
    expect(res.body).toContain("hello adx");
  });

  it("serves .js with a text/javascript content-type", async () => {
    await start();
    const res = await request(port, "/glue.js");
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/javascript; charset=utf-8");
  });

  it("404s a missing file", async () => {
    await start();
    const res = await request(port, "/nope.css");
    expect(res.status).toBe(404);
  });

  it("405s a non-GET/HEAD method", async () => {
    await start();
    const res = await request(port, "/", "POST");
    expect(res.status).toBe(405);
  });

  it("answers HEAD with headers and no body", async () => {
    await start();
    const res = await request(port, "/", "HEAD");
    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html; charset=utf-8");
    expect(res.body).toBe("");
  });

  it("403s a literal .. traversal attempt", async () => {
    await start();
    const res = await request(port, "/../../etc/passwd");
    expect(res.status).toBe(403);
    expect(res.body).not.toContain("root:");
  });

  it("403s an encoded-slash traversal attempt", async () => {
    await start();
    const res = await request(port, "/..%2f..%2fetc/passwd");
    expect(res.status).toBe(403);
    expect(res.body).not.toContain("root:");
  });
});
