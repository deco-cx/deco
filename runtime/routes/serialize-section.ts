import { FieldResolver } from "../../engine/core/resolver.ts";

const LAZY_SECTION_PATH = "/Rendering/Lazy.tsx";

export interface ResolvedSection {
  Component?: unknown;
  props?: Record<string, unknown>;
  metadata?: {
    component?: string;
    resolveChain?: FieldResolver[];
  };
}

export type SerializedSection =
  | { component: string; props: Record<string, unknown> }
  | { component: string; lazyUrl: string };

export interface LazyUrlContext {
  href: string;
  pathTemplate: string;
  renderSalt?: string;
  cb?: string;
}

export function buildLazyUrl(
  resolveChain: FieldResolver[],
  ctx: LazyUrlContext,
): string {
  const params = new URLSearchParams([
    ["format", "json"],
    ["props", JSON.stringify({ loading: "eager" })],
    ["href", ctx.href],
    ["pathTemplate", ctx.pathTemplate],
    [
      "resolveChain",
      JSON.stringify(FieldResolver.minify(resolveChain.slice(0, -1))),
    ],
  ]);
  if (ctx.renderSalt) params.set("renderSalt", ctx.renderSalt);
  if (ctx.cb) params.set("__cb", ctx.cb);
  return `/deco/render?${params}`;
}

function isSectionShape(value: unknown): value is ResolvedSection {
  if (!value || typeof value !== "object") return false;
  const meta = (value as ResolvedSection).metadata;
  return typeof meta?.component === "string";
}

function isLazyComponent(component: string | undefined): boolean {
  return !!component?.endsWith(LAZY_SECTION_PATH);
}

function getInnerSection(node: ResolvedSection): ResolvedSection | undefined {
  const inner = (node.props as { section?: unknown } | undefined)?.section;
  return isSectionShape(inner) ? inner : undefined;
}

function getLoading(node: ResolvedSection): string | undefined {
  return (node.props as { loading?: string } | undefined)?.loading;
}

export function serializeResolvedSection(
  node: ResolvedSection,
  ctx: LazyUrlContext,
): SerializedSection {
  let current = node;
  while (
    isLazyComponent(current.metadata?.component) &&
    getLoading(current) === "eager"
  ) {
    const inner = getInnerSection(current);
    if (!inner) break;
    current = inner;
  }

  if (
    isLazyComponent(current.metadata?.component) &&
    getLoading(current) === "lazy"
  ) {
    const inner = getInnerSection(current);
    return {
      component: inner?.metadata?.component ?? current.metadata!.component!,
      lazyUrl: buildLazyUrl(current.metadata!.resolveChain ?? [], ctx),
    };
  }

  return {
    component: current.metadata!.component!,
    props: walkValue(current.props ?? {}, ctx) as Record<string, unknown>,
  };
}

function walkValue(value: unknown, ctx: LazyUrlContext): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => walkValue(v, ctx));
  }
  if (value && typeof value === "object") {
    if (isSectionShape(value)) {
      return serializeResolvedSection(value, ctx);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "Component" && typeof v === "function") continue;
      out[k] = walkValue(v, ctx);
    }
    return out;
  }
  return value;
}
