import { describe, it, expect } from "vitest";
import { bareComputedKey } from "../src/behavior/compute-key.js";

describe("bareComputedKey", () => {
  it.each([
    ["getDisplayName", "displayName"],
    ["getURL", "uRL"], // acronym: only the first remaining char is lowercased
    ["getX", "x"],
    ["getName", "name"],
    ["getHTML", "hTML"],
  ])("%s -> %s", (input, expected) => {
    expect(bareComputedKey(input)).toBe(expected);
  });
});
