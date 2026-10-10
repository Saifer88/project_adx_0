/**
 * Sandboxed build-time execution of `behavior.adx.js`.
 *
 * The M1 compiler scanned `setup`/`get*` by name but never ran them. Phase 1
 * executes `setup(props)` in a hardened `node:vm` context to compute the true
 * build-time `state`, and exposes each `get*` as a lazy thunk so a referenced
 * computed value is resolved against that same state object.
 *
 * Security model (documented limit): `vm` is NOT a hard sandbox. We deny
 * ambient capabilities by OMITTING their globals from the context, so
 * `require`/`fs`/`process`/`fetch`/timers/`node:*` simply do not resolve
 * (`ReferenceError`). Every piece of user code runs through a timed
 * `runInContext`, so an infinite loop is aborted by the timeout. The context is
 * a throwaway realm discarded immediately after the build.
 */

import vm from "node:vm";
import { adxFileError } from "../errors.js";
import { EXPORT_RE } from "./scan.js";
import { bareComputedKey } from "./compute-key.js";
import type { BehaviorApi } from "./types.js";

const BEHAVIOR_FILE = "behavior.adx.js";

/** Options for {@link runSetup}. */
export interface RunSetupOptions {
  /** Per-run time budget in milliseconds (default 1000). */
  timeoutMs?: number;
}

/** The build-time behavior result: resolved state + lazy computed thunks. */
export interface RunSetupResult {
  /** The exact object `setup(props)` returned (no clone). */
  state: Record<string, unknown>;
  /** Bare computed name -> thunk, invoked lazily against `state`. */
  computed: Record<string, () => unknown>;
}

/**
 * Run a component's `setup(props)` (and expose its `get*` thunks) in a sandbox.
 *
 * @param behaviorSrc the raw `behavior.adx.js` source
 * @param props       the merged props object passed to `setup`
 * @param behavior    the scanned behavior API (name-only classification)
 * @param opts        timing options
 */
export function runSetup(
  behaviorSrc: string,
  props: Record<string, unknown>,
  behavior: BehaviorApi,
  opts: RunSetupOptions = {},
): RunSetupResult {
  const timeout = opts.timeoutMs ?? 1000;

  // (c) Fail BEFORE building any invocation so the appended tail never
  // references a non-existent `setup`.
  if (!behavior.hasSetup) {
    throw adxFileError(BEHAVIOR_FILE, 'Missing required export "setup"');
  }

  // (a) Frozen, minimal global surface. Everything NOT listed here is absent,
  // so user code referencing it gets a ReferenceError.
  const noop = function emit(): undefined {
    return undefined;
  };
  const seed = Object.freeze({
    Object,
    Array,
    String,
    Number,
    Boolean,
    Math,
    JSON,
    Date,
    RegExp,
    Map,
    Set,
    Symbol,
    Infinity,
    NaN,
    undefined,
    console: Object.freeze({
      log: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
    }),
    emit: noop,
  });
  const ctx = vm.createContext({ ...seed });

  // (b) Strip ONLY the leading `export ` keyword token of each EXPORT_RE match,
  // left-to-right, so every scanned spelling survives as a plain declaration.
  const stripped = stripExports(behaviorSrc);

  // (d) Inject props and append the single state-producing invocation.
  (ctx as Record<string, unknown>).__ADX_PROPS__ = props;
  const wrapped =
    stripped +
    "\n;globalThis.__ADX_STATE__ = setup(globalThis.__ADX_PROPS__);";

  let script: vm.Script;
  try {
    script = new vm.Script(wrapped, { filename: BEHAVIOR_FILE });
  } catch (err) {
    throw mapSandboxError(err);
  }
  try {
    script.runInContext(ctx, { timeout });
  } catch (err) {
    throw mapSandboxError(err);
  }

  let state = (ctx as Record<string, unknown>).__ADX_STATE__;
  if (typeof state !== "object" || state === null) {
    state = {};
  }

  // (e) Build the lazy computed map: bareComputedKey(name) -> thunk, each a
  // pre-compiled per-get* vm.Script run under its OWN timed runInContext.
  const computed: Record<string, () => unknown> = {};
  for (const name of behavior.computed) {
    const key = bareComputedKey(name);
    const thunkScript = new vm.Script(
      `globalThis.__ADX_COMPUTED__ = ${name}(globalThis.__ADX_STATE__);`,
      { filename: BEHAVIOR_FILE },
    );
    computed[key] = () => {
      try {
        thunkScript.runInContext(ctx, { timeout });
      } catch (err) {
        throw mapSandboxError(err);
      }
      return (ctx as Record<string, unknown>).__ADX_COMPUTED__;
    };
  }

  return { state: state as Record<string, unknown>, computed };
}

/**
 * Remove the leading `export ` keyword token of each top-level export,
 * preserving the rest of the declaration verbatim. Splices left-to-right using
 * the shared `EXPORT_RE` so `export function|async function|function*|const|
 * let|var` all become plain declarations.
 */
function stripExports(src: string): string {
  EXPORT_RE.lastIndex = 0;
  const spans: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = EXPORT_RE.exec(src)) !== null) {
    // The match starts at `export`; remove `export` + the following whitespace
    // so the next token (function/async/const/…) remains intact.
    const start = match.index;
    const afterExport = start + "export".length;
    let end = afterExport;
    while (end < src.length && /\s/.test(src[end])) {
      end++;
    }
    spans.push({ start, end });
  }
  // Splice right-to-left so earlier indices stay valid.
  let out = src;
  for (let i = spans.length - 1; i >= 0; i--) {
    const { start, end } = spans[i];
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

/**
 * Map a sandbox failure to the exact Phase 1 `[ADX] behavior.adx.js - …` error.
 *   timeout  -> `setup() exceeded time budget (1000ms)`
 *   anything -> `setup() failed: <message>`
 */
function mapSandboxError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (isTimeout(err, message)) {
    return adxFileError(
      BEHAVIOR_FILE,
      "setup() exceeded time budget (1000ms)",
    );
  }
  return adxFileError(BEHAVIOR_FILE, `setup() failed: ${message}`);
}

/** `vm` surfaces timeouts as an Error whose message mentions the time budget. */
function isTimeout(err: unknown, message: string): boolean {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (code === "ERR_SCRIPT_EXECUTION_TIMEOUT") {
      return true;
    }
  }
  return /timed out|execution.*timeout/i.test(message);
}
