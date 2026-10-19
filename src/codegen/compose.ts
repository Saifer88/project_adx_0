/**
 * Component composition — resolves custom tags against `manifest.deps`,
 * recursively compiles child instances with parent->child props, projects
 * parent content into child slots, and isolates each component's scoped CSS via
 * a repo-relative child scope id. Dependency cycles are rejected.
 *
 * The HTML emitter (`html.ts`) stays free of the compile pipeline: it calls
 * `build.compose(...)` when it meets a custom tag, and this module provides the
 * `compose` implementation plus the page-global {@link BuildState} accumulator.
 *
 * Per-instance identity: every emitted instance gets a monotonic ordinal
 * (`data-adx-i="i<ordinal>"`) and instance-scoped `data-adx-b` ids, so N
 * instances of a component stay independent for hydration (see the design's
 * "Per-instance identity" section).
 */

import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadManifest } from "../manifest/load.js";
import { scopeLocation } from "./scope-location.js";
import { adxError, adxFileError } from "../errors.js";
import { compileInstance } from "../compile.js";
import type { ElementNode, Node } from "../structure/ast.js";
import type { EvalScope } from "../expr/evaluate.js";
import type { Manifest } from "../manifest/types.js";
import type { BuildState, CodegenContext, EmitParent } from "./context.js";
import { evaluate, toText } from "../expr/evaluate.js";

/** Options for {@link createBuild}. */
export interface CreateBuildOptions {
  /** Repo root for stable, machine-independent repo-relative child scope ids. */
  repoRoot: string;
  /** Tokens path forwarded to every recursively compiled child. */
  tokensPath?: string;
}

/** Create a page-global build accumulator with the composer wired in. */
export function createBuild(opts: CreateBuildOptions): BuildState {
  const build: BuildState = {
    nextInstanceIndex: 0,
    distinct: new Map(),
    order: [],
    cycleStack: [],
    repoRoot: opts.repoRoot,
    tokensPath: opts.tokensPath,
    // Set below; declared here so the object shape is complete.
    compose: () => "",
  };
  build.compose = (element, parentCtx, parentScope, emitParent) =>
    emitComponentInstance(element, parentCtx, parentScope, emitParent, build);
  return build;
}

/** A dep-resolution table: tag name/basename -> absolute dep directory. */
type DepTable = Map<string, string>;

/** Cache of per-component dep tables keyed by the using component's abs dir. */
const depTableCache = new WeakMap<CodegenContext, DepTable>();

/**
 * Build (once per using component) a table mapping each dep's kebab-cased
 * `manifest.name` and its directory basename to the dep's absolute directory.
 * Deps resolve relative to the using component's own directory.
 */
function depTableFor(ctx: CodegenContext): DepTable {
  const cached = depTableCache.get(ctx);
  if (cached) return cached;

  const table: DepTable = new Map();
  for (const dep of ctx.manifest.deps) {
    const absDir = resolve(ctx.absDir, dep);
    if (!existsSync(join(absDir, "manifest.json"))) {
      throw adxFileError("manifest.json", `Dependency not found: "${dep}"`);
    }
    let depManifest: Manifest;
    try {
      depManifest = loadManifest(absDir);
    } catch {
      throw adxFileError("manifest.json", `Dependency not found: "${dep}"`);
    }
    table.set(kebab(depManifest.name), absDir);
    table.set(basename(absDir), absDir);
  }
  depTableCache.set(ctx, table);
  return table;
}

/**
 * Compose one resolved custom-tag element into its child instance's markup.
 * Returns the child body spliced in place of the custom tag.
 */
function emitComponentInstance(
  element: ElementNode,
  parentCtx: CodegenContext,
  parentScope: EvalScope,
  emitParent: EmitParent,
  build: BuildState,
): string {
  const table = depTableFor(parentCtx);
  const childDir = table.get(element.tag);
  if (!childDir) {
    throw adxError(
      "structure.adx",
      element.line,
      `Unknown component "${element.tag}" (not an HTML element; add to manifest deps)`,
    );
  }

  // Cycle detection: the child's absolute dir must not already be compiling.
  if (build.cycleStack.includes(childDir)) {
    const chain = [...build.cycleStack, childDir]
      .map((d) => basename(d))
      .join(" -> ");
    throw adxError(
      "structure.adx",
      element.line,
      `Dependency cycle: ${chain}`,
    );
  }

  const childManifest = loadManifest(childDir);
  const inst = compileInstance(childDir, {
    data: evalChildProps(element, parentScope),
    propSource: "composed",
    scopeLocation: scopeLocation(build.repoRoot, childDir),
    tokens: parentCtx.tokens,
    tokensPath: build.tokensPath,
    build,
    slots: { projected: buildProjected(element, childManifest), emitParent, parentScope },
  });

  // Register the distinct component (CSS/glue emitted once per abs dir) and
  // record this instance's merged props.
  let distinct = build.distinct.get(childDir);
  if (!distinct) {
    distinct = {
      absDir: childDir,
      scopeId: inst.scopeId,
      componentName: childManifest.name,
      css: inst.css,
      hooks: inst.hooks,
      instances: [],
    };
    build.distinct.set(childDir, distinct);
    build.order.push(childDir);
  }
  distinct.instances.push({ instanceIndex: inst.ctx.instanceIndex, props: inst.mergedProps, hooks: inst.hooks });

  return inst.body;
}

/**
 * Evaluate the custom element's `:prop` bindings and plain attrs against the
 * parent scope to produce a concrete child props object. `@event`s on a custom
 * tag are left to the parent's glue (the child root dispatches bubbling
 * CustomEvents), so they are not part of the child's props.
 */
function evalChildProps(
  element: ElementNode,
  parentScope: EvalScope,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const binding of element.bindings) {
    if (binding.expr) {
      props[binding.name] = evaluate(binding.expr, parentScope);
    } else if (binding.template) {
      let out = "";
      for (const part of binding.template) {
        out += "lit" in part ? part.lit : toText(evaluate(part.expr, parentScope));
      }
      props[binding.name] = out;
    } else {
      props[binding.name] = "";
    }
  }
  for (const attr of element.attrs) {
    props[attr.name] = attr.value === null ? true : attr.value;
  }
  return props;
}

/**
 * Build the projected-slot map from a custom element's children.
 *
 * `<template slot="x">…</template>` -> slot `x`; a `<template>` with no slot
 * attr and any non-template direct child -> the default slot (`""`). Whitespace
 * -only text between templates is ignored. A self-closing custom element
 * projects nothing. Duplicate content for the same NAMED slot is fatal; a
 * `slot="x"` the child does not declare is fatal.
 */
function buildProjected(
  element: ElementNode,
  childManifest: Manifest,
): Map<string, Node[]> {
  const projected = new Map<string, Node[]>();
  const declared = new Set(childManifest.slots);
  const namedSeen = new Set<string>();

  const push = (name: string, nodes: Node[]): void => {
    const existing = projected.get(name);
    if (existing) existing.push(...nodes);
    else projected.set(name, [...nodes]);
  };

  for (const child of element.children) {
    if (child.kind === "text") {
      // Ignore whitespace-only text between templates.
      if (child.parts.every((p) => "lit" in p && p.lit.trim() === "")) continue;
      push("", [child]);
      continue;
    }
    if (child.kind === "slot") {
      // A nested <slot> inside projected content is unusual; treat as default.
      push("", [child]);
      continue;
    }
    // Element: a <template slot="x"> targets a named slot; otherwise default.
    if (child.tag === "template") {
      const slotAttr = child.attrs.find((a) => a.name === "slot");
      if (slotAttr && slotAttr.value) {
        const name = slotAttr.value;
        if (!declared.has(name)) {
          throw adxError(
            "structure.adx",
            child.line,
            `Component "${element.tag}" has no slot "${name}"`,
          );
        }
        if (namedSeen.has(name)) {
          throw adxError(
            "structure.adx",
            child.line,
            `Duplicate slot content for "${name}"`,
          );
        }
        namedSeen.add(name);
        push(name, child.children);
        continue;
      }
      // Template with no slot attr -> default slot (its children).
      push("", child.children);
      continue;
    }
    // Any non-template element -> default slot.
    push("", [child]);
  }

  return projected;
}

/** Kebab-case a component name (`UserCard` -> `user-card`). */
function kebab(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}
