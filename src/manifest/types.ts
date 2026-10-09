/**
 * Manifest (`manifest.json`) types — the component's public contract.
 */

export type PropType = "string" | "number" | "boolean" | "array" | "object";

export interface PropDef {
  type: PropType;
  required?: boolean;
  default?: unknown;
}

/** Optional per-component/page SEO metadata; passed through untouched. */
export interface SeoMeta {
  title?: string;
  description?: string;
  schema?: string;
}

export interface Manifest {
  name: string;
  version: string;
  props: Record<string, PropDef>;
  emits: string[];
  slots: string[];
  deps: string[];
  seo?: SeoMeta;
}
