import { describe, it, expect } from "vitest";
import { resolveProps } from "../src/compile.js";
import type { Manifest } from "../src/manifest/types.js";

function manifest(props: Manifest["props"]): Manifest {
  return {
    name: "Demo",
    version: "1.0.0",
    props,
    emits: [],
    slots: [],
    deps: [],
  };
}

describe("resolveProps — merge precedence", () => {
  it("overlays data on manifest defaults (data wins per key)", () => {
    const m = manifest({
      role: { type: "string", default: "User" },
      avatar: { type: "string", default: "/default.png" },
    });
    const merged = resolveProps(m, { role: "Engineer" }, "standalone");
    expect(merged).toEqual({ role: "Engineer", avatar: "/default.png" });
  });

  it("keeps defaults when no data is supplied", () => {
    const m = manifest({ role: { type: "string", default: "User" } });
    expect(resolveProps(m, undefined, "standalone")).toEqual({ role: "User" });
  });

  it("accepts a supplied value for a required prop with no default", () => {
    const m = manifest({ name: { type: "string", required: true } });
    expect(resolveProps(m, { name: "Ada" }, "standalone")).toEqual({
      name: "Ada",
    });
  });
});

describe("resolveProps — required-prop validation", () => {
  const m = manifest({ name: { type: "string", required: true } });

  it("standalone hint mentions --data", () => {
    expect(() => resolveProps(m, undefined, "standalone")).toThrow(
      '[ADX] manifest.json - Missing required prop "name" (no default and none supplied via --data)',
    );
  });

  it("page hint mentions the page's component data", () => {
    expect(() => resolveProps(m, undefined, "page")).toThrow(
      '[ADX] manifest.json - Missing required prop "name" (no default and no value in the page\'s component data)',
    );
  });

  it("composed hint mentions the parent", () => {
    expect(() => resolveProps(m, undefined, "composed")).toThrow(
      '[ADX] manifest.json - Missing required prop "name" (no default and no value passed by the parent)',
    );
  });

  it("shares the same stem across sources", () => {
    for (const source of ["standalone", "page", "composed"] as const) {
      expect(() => resolveProps(m, undefined, source)).toThrow(
        /Missing required prop "name" \(no default and /,
      );
    }
  });
});
