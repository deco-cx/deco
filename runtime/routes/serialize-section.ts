import { Context } from "../../deco.ts";
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

/**
 * Module-level control of how a section renders to JSON.
 *
 * - `false` — the section has no JSON rendering; it is dropped from the
 *   serialized output entirely.
 * - function — a projection applied to the resolved props before
 *   serialization. Annotate the parameter with `SectionProps<typeof loader>`
 *   (or the section's own Props) to keep it compile-checked.
 *
 * ```ts
 * export const renderJson = false;
 *
 * export const renderJson = (
 *   { internalOnly, ...rest }: SectionProps<typeof loader>,
 * ) => rest;
 * ```
 */
export type RenderJson =
  // deno-lint-ignore no-explicit-any
  | ((props: any) => Record<string, unknown>)
  | false;

export interface SectionJsonModule {
  renderJson?: RenderJson;
}

export interface LazyUrlContext {
  href: string;
  pathTemplate: string;
  renderSalt?: string;
  cb?: string;
}

export interface SerializeContext extends LazyUrlContext {
  /**
   * Resolves a section module by its component name (resolveType) so the
   * serializer can honor its `renderJson` export. When omitted, every
   * section serializes with its full resolved props.
   */
  getSectionModule?: (component: string) => SectionJsonModule | undefined;
}

/**
 * Builds a `getSectionModule` lookup over the active context's merged
 * manifest (site + apps), keyed by resolveType.
 */
export const sectionModuleLookup = async (): Promise<
  (component: string) => SectionJsonModule | undefined
> => {
  const runtime = await Context.active().runtime;
  const sections = (runtime?.manifest as unknown as {
    sections?: Record<string, SectionJsonModule>;
  })?.sections ?? {};
  return (component) => sections[component];
};

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

function renderJsonOf(
  ctx: SerializeContext,
  component: string,
): RenderJson | undefined {
  return ctx.getSectionModule?.(component)?.renderJson;
}

/**
 * Serializes a resolved section honoring its `renderJson` export.
 * Returns `null` when the section opted out (`renderJson === false`) —
 * callers must drop it from the output.
 *
 * A `renderJson` projection cannot run for lazy placeholders (their props
 * are not resolved yet); it applies on the lazy fetch itself, when
 * `/deco/render?format=json` serializes the resolved section.
 */
export function serializeResolvedSection(
  node: ResolvedSection,
  ctx: SerializeContext,
): SerializedSection | null {
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
    const component = inner?.metadata?.component ??
      current.metadata!.component!;
    if (renderJsonOf(ctx, component) === false) return null;
    return {
      component,
      // The wrapper's resolveChain is what reconstructs this slot on the lazy
      // fetch — it re-resolves the inner section and applies the inner's
      // renderJson there. The inner is not independently resolvable, so its own
      // chain would not rebuild this position; the wrapper's chain is correct.
      lazyUrl: buildLazyUrl(current.metadata!.resolveChain ?? [], ctx),
    };
  }

  const component = current.metadata!.component!;
  const renderJson = renderJsonOf(ctx, component);
  if (renderJson === false) return null;

  const props = typeof renderJson === "function"
    ? renderJson(current.props ?? {})
    : current.props ?? {};

  return {
    component,
    props: walkValue(props, ctx) as Record<string, unknown>,
  };
}

function walkValue(value: unknown, ctx: SerializeContext): unknown {
  if (Array.isArray(value)) {
    // Dropped sections (renderJson === false) are removed from arrays so
    // consumers iterate a dense list; non-section nulls pass through.
    const out: unknown[] = [];
    for (const v of value) {
      if (isSectionShape(v)) {
        const serialized = serializeResolvedSection(v, ctx);
        if (serialized !== null) out.push(serialized);
      } else {
        out.push(walkValue(v, ctx));
      }
    }
    return out;
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
