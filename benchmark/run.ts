/**
 * ADX token benchmark harness.
 *
 * Measures the token cost of reading an ADX component's source vs an equivalent
 * React implementation across three concrete agent tasks (understand /
 * modify-style / add-prop), using the pure-JS `gpt-tokenizer` with the GPT-4o
 * `o200k_base` encoder.
 *
 * The tokenizing + aggregation logic lives in the pure `measure()` function so
 * it can be unit-tested with in-memory strings and a stubbed encoder, with no
 * dependency on real model token counts or on the filesystem.
 *
 * This is a DEV tool. A missing fixture file or an encoder import failure throws
 * a plain Node error (NOT an `[ADX]` compiler error) and fails `npm run benchmark`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** Encodes a string to tokens. The real impl is gpt-tokenizer's o200k_base. */
export type Encoder = (text: string) => number[];

/** A single file with its already-read contents (keeps measure() pure). */
export interface MeasuredFile {
  path: string;
  content: string;
}

/** One benchmark task's file sets, as in-memory contents. */
export interface TaskFileSet {
  id: string;
  label: string;
  adx: MeasuredFile[];
  react: MeasuredFile[];
}

/** Per-framework token total for one task. */
export interface FrameworkResult {
  tokens: number;
  files: { path: string; tokens: number }[];
}

/** Measured result for one task. */
export interface TaskResult {
  id: string;
  label: string;
  adx: FrameworkResult;
  react: FrameworkResult;
  /** (react - adx) / react, in [0,1] (0 when react is empty). */
  savings: number;
}

/** The full benchmark result. */
export interface Results {
  encoder: string;
  tasks: TaskResult[];
}

/** Raw tasks.json shape (paths, not yet read). */
interface TasksFile {
  encoder?: string;
  tasks: { id: string; label: string; adx: string[]; react: string[] }[];
}

function sumFiles(
  files: MeasuredFile[],
  encode: Encoder,
): FrameworkResult {
  const perFile = files.map((f) => ({
    path: f.path,
    tokens: encode(f.content).length,
  }));
  const tokens = perFile.reduce((acc, f) => acc + f.tokens, 0);
  return { tokens, files: perFile };
}

/**
 * Pure measurement core. Tokenizes every file in each task's ADX and React
 * sets, sums per framework, and computes savings. No I/O, no global state —
 * everything comes from `fileSets` and the injected `encode`.
 */
export function measure(
  fileSets: TaskFileSet[],
  encode: Encoder,
  encoderName: string,
): Results {
  const tasks: TaskResult[] = fileSets.map((set) => {
    const adx = sumFiles(set.adx, encode);
    const react = sumFiles(set.react, encode);
    const savings = react.tokens === 0 ? 0 : (react.tokens - adx.tokens) / react.tokens;
    return { id: set.id, label: set.label, adx, react, savings };
  });
  return { encoder: encoderName, tasks };
}

function pct(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** Renders the results as a fixed-width stdout table. */
export function formatTable(results: Results): string {
  const lines: string[] = [];
  lines.push(`Encoder: ${results.encoder}`);
  lines.push("");
  const header = ["Task", "React", "ADX", "Savings"];
  const rows = results.tasks.map((t) => [
    t.id,
    String(t.react.tokens),
    String(t.adx.tokens),
    pct(t.savings),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const fmt = (cols: string[]) =>
    cols.map((c, i) => c.padEnd(widths[i])).join("  ");
  lines.push(fmt(header));
  lines.push(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) lines.push(fmt(r));
  return lines.join("\n");
}

function loadFileSets(benchmarkDir: string): {
  encoderName: string;
  fileSets: TaskFileSet[];
} {
  const tasksPath = join(benchmarkDir, "tasks.json");
  const raw = JSON.parse(readFileSync(tasksPath, "utf8")) as TasksFile;
  const read = (rel: string): MeasuredFile => ({
    path: rel,
    content: readFileSync(join(benchmarkDir, rel), "utf8"),
  });
  const fileSets: TaskFileSet[] = raw.tasks.map((t) => ({
    id: t.id,
    label: t.label,
    adx: t.adx.map(read),
    react: t.react.map(read),
  }));
  return { encoderName: raw.encoder ?? "o200k_base", fileSets };
}

async function main(): Promise<void> {
  // Dynamic import so an encoder import failure throws a plain Node error at run
  // time (dev tool), per the Phase 5 error-handling rule.
  const { encode } = await import("gpt-tokenizer/encoding/o200k_base");
  const encoderName = "o200k_base";

  // Compiled to dist/benchmark/run.js; the source benchmark/ (tasks.json +
  // fixtures) lives at <projectRoot>/benchmark. From dist/benchmark/run.js:
  // dirname -> dist/benchmark, up two -> projectRoot, then into benchmark/.
  const fileDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = dirname(dirname(fileDir));
  const sourceBenchmarkDir = join(projectRoot, "benchmark");

  const { fileSets } = loadFileSets(sourceBenchmarkDir);
  const results = measure(fileSets, encode as Encoder, encoderName);

  process.stdout.write(`Tokenized with gpt-tokenizer encoder: ${encoderName}\n\n`);
  process.stdout.write(formatTable(results) + "\n");

  const outPath = join(sourceBenchmarkDir, "results.json");
  const { writeFileSync } = await import("node:fs");
  writeFileSync(outPath, JSON.stringify(results, null, 2) + "\n");
  process.stdout.write(`\nWrote ${outPath}\n`);
}

// Run only when executed directly (not when imported by the unit test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err: unknown) => {
    process.stderr.write(String(err instanceof Error ? err.stack : err) + "\n");
    process.exit(1);
  });
}
