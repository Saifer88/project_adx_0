import { describe, it, expect } from "vitest";
import { evaluate, truthy, toText } from "../src/expr/evaluate.js";
import { parseExpr } from "../src/expr/parse-expr.js";

const e = (raw: string) => parseExpr(raw, "structure.adx", 1);

describe("evaluate", () => {
  it("resolves identifiers from setup state", () => {
    expect(evaluate(e("name"), { state: { name: "Ada" } })).toBe("Ada");
  });

  it("falls back to props when state lacks the key", () => {
    expect(evaluate(e("role"), { state: {}, props: { role: "Eng" } })).toBe("Eng");
  });

  it("prefers loop locals over state and props", () => {
    const scope = {
      locals: [{ item: "inner" }],
      state: { item: "state" },
      props: { item: "props" },
    };
    expect(evaluate(e("item"), scope)).toBe("inner");
  });

  it("walks member access", () => {
    const scope = { state: { user: { profile: { name: "Grace" } } } };
    expect(evaluate(e("user.profile.name"), scope)).toBe("Grace");
  });

  it("resolves a bare computed name to its getXxx result", () => {
    const scope = { computed: { displayName: () => "ADA" } };
    expect(evaluate(e("displayName"), scope)).toBe("ADA");
  });

  it("returns undefined for unknown identifiers", () => {
    expect(evaluate(e("missing"), { state: {} })).toBeUndefined();
  });

  it("returns undefined when member access hits null/undefined", () => {
    expect(evaluate(e("a.b.c"), { state: { a: null } })).toBeUndefined();
  });
});

describe("truthy", () => {
  it("treats empty string as falsy", () => {
    expect(truthy("")).toBe(false);
    expect(truthy("x")).toBe(true);
  });

  it("treats null/undefined as falsy", () => {
    expect(truthy(null)).toBe(false);
    expect(truthy(undefined)).toBe(false);
  });
});

describe("toText", () => {
  it("maps null/undefined to empty string", () => {
    expect(toText(null)).toBe("");
    expect(toText(undefined)).toBe("");
  });

  it("stringifies other values", () => {
    expect(toText(42)).toBe("42");
    expect(toText("hi")).toBe("hi");
  });
});
