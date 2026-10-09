import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadTokens } from "../src/tokens/load.js";
import { scanBehavior } from "../src/behavior/scan.js";
import { scopeId } from "../src/codegen/scope.js";
import type { CodegenContext } from "../src/codegen/context.js";
import type { Manifest } from "../src/manifest/types.js";
import type { TokenTable } from "../src/tokens/types.js";

const here = dirname(fileURLToPath(import.meta.url));

export const fixtureDir = join(here, "..", "fixtures", "user-card");
export const tokensPath = join(here, "..", "tokens", "design-tokens.json");

export function tokens(): TokenTable {
  return loadTokens(tokensPath);
}

/** A minimal UserCard-like context for exercising the emitters directly. */
export function makeCtx(
  overrides: Partial<{
    state: Record<string, unknown>;
    manifest: Manifest;
    behaviorSrc: string;
  }> = {},
): CodegenContext {
  const manifest: Manifest = overrides.manifest ?? {
    name: "UserCard",
    version: "1.0.0",
    props: {
      name: { type: "string", required: true },
      avatar: { type: "string", default: "/default.png" },
      bio: { type: "string", default: "" },
      role: { type: "string", default: "User" },
    },
    emits: ["click", "follow"],
    slots: ["actions"],
    deps: [],
  };
  const state = overrides.state ?? {
    name: "Ada Lovelace",
    avatar: "/ada.png",
    bio: "",
    role: "Engineer",
    tags: [],
  };
  const behaviorSrc =
    overrides.behaviorSrc ??
    "export function setup(p){return p} export function onClick(){}";
  return {
    componentName: manifest.name,
    scopeId: scopeId(manifest.name, "user-card"),
    scope: { state, props: state },
    tokens: tokens(),
    behavior: scanBehavior(behaviorSrc, "behavior.adx.js"),
    manifest,
  };
}
