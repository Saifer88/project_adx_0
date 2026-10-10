/**
 * ADX compiler public entry point (Milestone 1 front-end).
 *
 * FEAT-001 ships the analysis stages that turn `.adx` inputs into validated
 * data structures. Codegen and the CLI arrive in FEAT-002.
 */

export { AdxError, formatError, adxError, adxFileError } from "./errors.js";
export type { AdxErrorInit } from "./errors.js";
export { SourceText } from "./source.js";

export { parseStructure } from "./structure/parser.js";
export { tokenize, VOID_ELEMENTS } from "./structure/tokenizer.js";
export type { Token } from "./structure/tokenizer.js";
export type {
  Node,
  ElementNode,
  SlotNode,
  TextNode,
  TextPart,
  Expr,
  Binding,
  Attr,
  EventBinding,
  Directives,
} from "./structure/ast.js";

export { parseExpr } from "./expr/parse-expr.js";
export { evaluate, truthy, toText } from "./expr/evaluate.js";
export type { EvalScope } from "./expr/evaluate.js";

export { loadManifest, parseManifest } from "./manifest/load.js";
export type { Manifest, PropDef, PropType, SeoMeta } from "./manifest/types.js";

export { loadTokens, parseTokens } from "./tokens/load.js";
export type { TokenTable, RawTokens } from "./tokens/types.js";

export { scanBehavior, EXPORT_RE } from "./behavior/scan.js";
export type { BehaviorApi } from "./behavior/types.js";
export { bareComputedKey } from "./behavior/compute-key.js";
export { runSetup } from "./behavior/run.js";
export type { RunSetupOptions, RunSetupResult } from "./behavior/run.js";

export { scopeId, bindingId } from "./codegen/scope.js";
export { emitHtml } from "./codegen/html.js";
export type { BindingHook, HtmlEmitResult } from "./codegen/html.js";
export { transformCss } from "./codegen/css.js";
export { emitGlue } from "./codegen/glue.js";
export type { CodegenContext } from "./codegen/context.js";

export {
  compileComponent,
  checkComponent,
  compileInstance,
  resolveProps,
  escapeHtml,
  indentBlock,
} from "./compile.js";
export type {
  CompileOptions,
  CompiledComponent,
  CompiledInstance,
  PropSource,
} from "./compile.js";

export { repoRoot, scopeLocation } from "./codegen/scope-location.js";

export { loadPage, parsePage } from "./page/load.js";
export type { PageManifest, PageComponent } from "./page/types.js";
export { compilePage, checkPage, wrapPageDocument } from "./page/compile.js";
export type {
  CompilePageOptions,
  CompiledPage,
  PageComponentAsset,
} from "./page/compile.js";
