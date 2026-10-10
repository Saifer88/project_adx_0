import { describe, it, expect } from "vitest";
import { runSetup } from "../src/behavior/run.js";
import { scanBehavior } from "../src/behavior/scan.js";

/** Scan + run in one step for brevity. */
function run(src: string, props: Record<string, unknown> = {}) {
  return runSetup(src, props, scanBehavior(src, "behavior.adx.js"));
}

describe("runSetup — benign setup", () => {
  it("runs a plain setup and returns its state", () => {
    const { state } = run(
      "export function setup(p){ return { greeting: 'hi ' + p.name } }",
      { name: "Ada" },
    );
    expect(state).toEqual({ greeting: "hi Ada" });
  });

  it("treats a non-object setup return as {}", () => {
    const { state } = run("export function setup(){ return undefined }");
    expect(state).toEqual({});
  });

  it("function and arrow setup forms yield the same state", () => {
    const fnForm = run(
      "export function setup(p){ return { n: p.name } }",
      { name: "Ada" },
    );
    const constForm = run(
      "export const setup = (p) => ({ n: p.name });",
      { name: "Ada" },
    );
    expect(fnForm.state).toEqual(constForm.state);
  });
});

describe("runSetup — sandbox denies ambient capabilities", () => {
  it("maps a require('fs') reference to an [ADX] setup() failed error", () => {
    expect(() =>
      run("export function setup(){ const fs = require('fs'); return {} }"),
    ).toThrow(/^\[ADX\] behavior\.adx\.js - setup\(\) failed: /);
  });

  it("maps process access to an [ADX] setup() failed error", () => {
    expect(() =>
      run("export function setup(){ return { p: process.env } }"),
    ).toThrow(/^\[ADX\] behavior\.adx\.js - setup\(\) failed: /);
  });
});

describe("runSetup — timeout", () => {
  it("aborts an infinite loop with the time-budget error", () => {
    expect(() =>
      run("export function setup(){ while(true){} }"),
    ).toThrow("[ADX] behavior.adx.js - setup() exceeded time budget (1000ms)");
  });
});

describe("runSetup — missing setup", () => {
  it("fails fatally before any invocation when setup is absent", () => {
    expect(() =>
      run("export function onClick(){}"),
    ).toThrow('[ADX] behavior.adx.js - Missing required export "setup"');
  });
});

describe("runSetup — computed get* thunks", () => {
  it("collects getDisplayName as the bare key displayName", () => {
    const { computed } = run(
      "export function setup(p){ return { name: p.name } }\n" +
        "export function getDisplayName(s){ return s.name.toUpperCase() }",
      { name: "Ada" },
    );
    expect(Object.keys(computed)).toEqual(["displayName"]);
    expect(computed.displayName()).toBe("ADA");
  });

  it("never invokes an unused get*", () => {
    const { computed } = run(
      "export function setup(){ return {} }\n" +
        "export function getBoom(){ throw new Error('should not run') }",
    );
    // Collected but not invoked, so no throw occurs here.
    expect(Object.keys(computed)).toEqual(["boom"]);
  });
});
