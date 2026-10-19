import { describe, it, expect } from "vitest";
import {
  measure,
  formatTable,
  summarizeWorkflows,
  type WorkflowRun,
  type Encoder,
  type TaskFileSet,
} from "../benchmark/run.js";

/**
 * Stubbed encoder: one "token" per whitespace-separated word. Deterministic and
 * independent of real model token counts, so the test asserts the aggregation
 * and savings math only.
 */
const wordEncoder: Encoder = (text) =>
  text.trim() === "" ? [] : (text.trim().split(/\s+/) as unknown as number[]);

describe("recorded workflow comparison", () => {
  const adx: WorkflowRun = { task: "add-prop", model: "test-model", trial: "1", protocol: "test-v1", framework: "adx", inputTokens: 100, cachedInputTokens: 40, outputTokens: 20, durationMs: 1000, attempts: 1, passed: true, evidence: "test-only" };
  const react: WorkflowRun = { ...adx, framework: "react", inputTokens: 200, outputTokens: 40 };

  it("counts input and output without double-counting cached input", () => {
    const report = summarizeWorkflows([adx, react]);
    expect(report.comparisons[0].adx.totalTokens).toBe(120);
    expect(report.comparisons[0].savings).toBe(0.5);
    expect(report.totals[0]).toMatchObject({ totalTokens: 120, durationMs: 1000, attempts: 1, successRate: 1 });
  });

  it("retains failed-run costs without presenting failure as savings", () => {
    const report = summarizeWorkflows([{ ...adx, passed: false, attempts: 3 }, react]);
    expect(report.comparisons[0].savings).toBeNull();
    expect(report.totals[0]).toMatchObject({ totalTokens: 120, attempts: 3, successRate: 0 });
  });

  it("rejects unmatched, duplicate, and incomparable runs", () => {
    expect(() => summarizeWorkflows([adx])).toThrow(/both ADX and React/);
    expect(() => summarizeWorkflows([adx, adx, react])).toThrow(/Duplicate/);
    expect(() => summarizeWorkflows([adx, { ...react, protocol: "other" }])).toThrow(/same protocol/);
  });

  it("requires valid counts and evidence", () => {
    expect(() => summarizeWorkflows([{ ...adx, inputTokens: -1 }, react])).toThrow(/inputTokens/);
    expect(() => summarizeWorkflows([{ ...adx, cachedInputTokens: 101 }, react])).toThrow(/cached token/);
    expect(() => summarizeWorkflows([{ ...adx, evidence: "" }, react])).toThrow(/evidence/);
    expect(() => summarizeWorkflows([])).toThrow(/non-empty/);
  });
});

describe("measure (pure)", () => {
  const fileSets: TaskFileSet[] = [
    {
      id: "understand",
      label: "Understand",
      adx: [
        { path: "adx/a", content: "one two" }, // 2
        { path: "adx/b", content: "three" }, // 1
      ],
      react: [
        { path: "react/a", content: "w x y z" }, // 4
        { path: "react/b", content: "p q r s t u" }, // 6
      ],
    },
    {
      id: "modify-style",
      label: "Modify style",
      adx: [{ path: "adx/c", content: "a b c" }], // 3
      react: [{ path: "react/c", content: "d e f g h i" }], // 6
    },
  ];

  it("sums tokens per task per framework", () => {
    const r = measure(fileSets, wordEncoder, "stub");
    expect(r.encoder).toBe("stub");

    const understand = r.tasks[0];
    expect(understand.adx.tokens).toBe(3); // 2 + 1
    expect(understand.react.tokens).toBe(10); // 4 + 6
    expect(understand.adx.files).toEqual([
      { path: "adx/a", tokens: 2 },
      { path: "adx/b", tokens: 1 },
    ]);

    const modify = r.tasks[1];
    expect(modify.adx.tokens).toBe(3);
    expect(modify.react.tokens).toBe(6);
  });

  it("computes savings = (react - adx) / react", () => {
    const r = measure(fileSets, wordEncoder, "stub");
    expect(r.tasks[0].savings).toBeCloseTo((10 - 3) / 10, 10); // 0.7
    expect(r.tasks[1].savings).toBeCloseTo((6 - 3) / 6, 10); // 0.5
  });

  it("treats an empty react set as zero savings (no divide-by-zero)", () => {
    const r = measure(
      [{ id: "t", label: "t", adx: [{ path: "a", content: "x y" }], react: [] }],
      wordEncoder,
      "stub",
    );
    expect(r.tasks[0].react.tokens).toBe(0);
    expect(r.tasks[0].savings).toBe(0);
  });

  it("calls the injected encoder for every file (stub, not real counts)", () => {
    const seen: string[] = [];
    const spy: Encoder = (text) => {
      seen.push(text);
      return wordEncoder(text);
    };
    measure(fileSets, spy, "stub");
    expect(seen).toEqual(["one two", "three", "w x y z", "p q r s t u", "a b c", "d e f g h i"]);
  });

  it("renders a table naming the encoder", () => {
    const table = formatTable(measure(fileSets, wordEncoder, "stub"));
    expect(table).toContain("Encoder: stub");
    expect(table).toContain("understand");
    expect(table).toContain("Savings");
  });
});
