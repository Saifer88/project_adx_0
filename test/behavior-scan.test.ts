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
  it("ignores exports inside comments, strings and template literals", () => {
    const api = scanBehavior('/* export function onFake() {} */\nexport function setup(){ return {text: "export function onString(){}", template: `export const getFake = 1`} }');
    expect(api.all).toEqual(["setup"]);
  });

  it("finds every declared name in a variable export", () => {
    expect(scanBehavior('export const setup = () => ({}), onClick = () => {};').all).toEqual(["onClick", "setup"]);
  });

  it("reports malformed JavaScript with its source line", () => {
    expect(() => scanBehavior('export function setup( {')).toThrow(/\[ADX\] behavior.adx.js:1/);
  });

  it("rejects unsupported module forms explicitly", () => {
    expect(() => scanBehavior('import value from "other";')).toThrow(/imports and re-exports are unsupported/);
    expect(() => scanBehavior('const setup = () => ({}); export {setup};')).toThrow(/export declarations/);
  });

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
