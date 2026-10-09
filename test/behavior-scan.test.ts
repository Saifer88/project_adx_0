import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scanBehavior } from "../src/behavior/scan.js";

const here = dirname(fileURLToPath(import.meta.url));
const behaviorPath = join(
  here,
  "..",
  "fixtures",
  "user-card",
  "behavior.adx.js",
);

describe("behavior scanner", () => {
  it("scans the UserCard fixture", () => {
    const api = scanBehavior(readFileSync(behaviorPath, "utf8"), "behavior.adx.js");
    expect(api.hasSetup).toBe(true);
    expect(api.events).toEqual(["onClick", "onFollowClick"]);
    expect(api.all).toEqual(["onClick", "onFollowClick", "setup"]);
  });

  it("classifies setup, events, computed and lifecycle", () => {
    const src = `
      export function setup(props) { return {} }
      export function onClick(state) {}
      export const onInput = (state) => {}
      export function getDisplayName(state) { return state.name }
      export function onMounted(state) {}
      export function onUnmounted(state) {}
      export function helper() {}
    `;
    const api = scanBehavior(src, "behavior.adx.js");
    expect(api.hasSetup).toBe(true);
    expect(api.events).toEqual(["onClick", "onInput"]);
    expect(api.computed).toEqual(["getDisplayName"]);
    expect(api.lifecycle).toEqual(["onMounted", "onUnmounted"]);
    expect(api.other).toEqual(["helper"]);
  });

  it("reports missing setup", () => {
    const api = scanBehavior("export function onClick() {}", "behavior.adx.js");
    expect(api.hasSetup).toBe(false);
  });

  it("does not misclassify lifecycle as events", () => {
    const api = scanBehavior("export function onUpdated() {}", "behavior.adx.js");
    expect(api.lifecycle).toEqual(["onUpdated"]);
    expect(api.events).toEqual([]);
  });
});
