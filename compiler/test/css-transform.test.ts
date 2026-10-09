import { describe, it, expect } from "vitest";
import { transformCss } from "../src/codegen/css.js";
import { makeCtx } from "./helpers.js";

describe("transformCss", () => {
  it("strips @use tokens; and scopes selectors", () => {
    const ctx = makeCtx();
    const css = transformCss("@use tokens;\n.card { display: flex; }", ctx);
    expect(css).not.toContain("@use");
    expect(css).toContain(`.card[data-adx-c="${ctx.scopeId}"]`);
  });

  it("expands abbreviated properties", () => {
    const ctx = makeCtx();
    const css = transformCss(
      ".card { pad: tokens.space-4; bg: tokens.surface-0; radius: tokens.radius-lg; size: tokens.text-xl; weight: tokens.weight-bold; shadow: tokens.shadow-md; }",
      ctx,
    );
    expect(css).toContain("padding: 16px;");
    expect(css).toContain("background: #ffffff;");
    expect(css).toContain("border-radius: 12px;");
    expect(css).toContain("font-size: 20px;");
    expect(css).toContain("font-weight: 700;");
    expect(css).toContain("box-shadow: 0 4px 8px rgba(16, 24, 40, 0.1);");
  });

  it("resolves tokens.* to values", () => {
    const ctx = makeCtx();
    const css = transformCss(".x { color: tokens.text-1; }", ctx);
    expect(css).toContain("color: #1a1f29;");
    expect(css).not.toContain("tokens.");
  });

  it("throws the exact unknown-token error", () => {
    const ctx = makeCtx();
    expect(() =>
      transformCss("@use tokens;\n.card {\n  pad: tokens.space-5;\n}", ctx),
    ).toThrow(
      '[ADX] style.adx.css:3 - Unknown token "tokens.space-5" (available: 0,1,2,3,4,6,8,12,16)',
    );
  });

  it("passes @media through and resolves breakpoint tokens to px", () => {
    const ctx = makeCtx();
    const css = transformCss(
      "@media (min-width: tokens.breakpoint-md) { .card { pad: tokens.space-2; } }",
      ctx,
    );
    expect(css).toContain("@media (min-width: 768px)");
    expect(css).toContain(`.card[data-adx-c="${ctx.scopeId}"]`);
    expect(css).toContain("padding: 8px;");
  });
});
