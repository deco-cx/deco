import type { ComponentType } from "preact";
import { useContext } from "preact/hooks";
import { SectionContext } from "../components/section.tsx";
import { FieldResolver } from "../engine/core/resolver.ts";

import { Murmurhash3 } from "../deps.ts";

const hasher = new Murmurhash3();

export type FilterMode = "blocklist" | "allowlist";

export interface QueryStringFilterConfig {
  mode: FilterMode;
  list: Set<string>;
}

// List from cloudflare APO https://developers.cloudflare.com/automatic-platform-optimization/reference/query-parameters
/** List of querystring that should not vary cache */
const BLOCKED_QS = new Set<string>([
  "ref",
  "fbclid",
  "fb_action_ids",
  "fb_action_types",
  "fb_source",
  "mc_cid",
  "mc_eid",
  "gclid",
  "dclid",
  "_ga",
  "campaignid",
  "adgroupid",
  "_ke",
  "cn-reloaded",
  "age-verified",
  "ao_noptimize",
  "usqp",
  "mkt_tok",
  "epik",
  "ck_subscriber_id",
]);

const ALLOWED_QS = new Set<string>([
  // === Product Identification ===
  "id",
  "sku",
  "product_id",
  "variant_id",
  "item_id",

  // === Product Attributes ===
  "color",
  "size",
  "style",
  "material",
  "variant",

  // === Navigation & Pagination ===
  "page",
  "limit",
  "offset",
  "per_page",
  "cursor",

  // === Search & Query ===
  "search",
  "q",
  "query",
  "keyword",
  "term",

  // === Sorting & Ordering ===
  "sort",
  "order",
  "orderBy",
  "sortBy",
  "direction",

  // === Filtering ===
  "category",
  "brand",
  "collection",
  "filter",
  "facet",
  "tag",
  "type",

  // === Price Range ===
  "min_price",
  "max_price",
  "price_range",

  // === Availability & Status ===
  "in_stock",
  "on_sale",
  "new_arrival",
  "available",

  // === UI State ===
  "tab",
  "section",
  "modal",
  "view",
  "mode",

  // === Discount & Promotions ===
  "discount",
  "coupon",
  "promo_code",
]);

let currentConfig: QueryStringFilterConfig = {
  mode: "blocklist",
  list: BLOCKED_QS,
};

export const setFilterMode = (mode: FilterMode): void => {
  currentConfig.mode = mode;
  currentConfig.list = mode === "blocklist" ? BLOCKED_QS : ALLOWED_QS;
};

export const addAllowedQS = (queryStrings: string[]): void => {
  queryStrings.forEach((qs) => ALLOWED_QS.add(qs));
};

export const addBlockedQS = (queryStrings: string[]): void => {
  queryStrings.forEach((qs) => BLOCKED_QS.add(qs));
};


export const setCustomConfig = (
  config: Partial<QueryStringFilterConfig>,
): void => {
  currentConfig = { ...currentConfig, ...config };
};

export const getFilterConfig = (): QueryStringFilterConfig => {
  return {
    mode: currentConfig.mode,
    list: new Set(currentConfig.list), // Return a copy to prevent external mutation
  };
};

const createStableHref = (href: string): string => {
  const hrefUrl = new URL(href!, "http://localhost:8000");
  const qsList = [...hrefUrl.searchParams.keys()];

  qsList.forEach((qsName: string) => {
    const shouldRemove = currentConfig.mode === "blocklist"
      ? currentConfig.list.has(qsName)
      : !currentConfig.list.has(qsName);

    if (shouldRemove) {
      hrefUrl.searchParams.delete(qsName);
    }
  });

  hrefUrl.searchParams.sort();
  return hrefUrl.href;
};

export type Options<P> = {
  /** Section props partially applied */
  props?: Partial<P extends ComponentType<infer K> ? K : P>;

  /** Path where section is to be found */
  href?: string;
};

export const useSection = <P>(
  { props = {}, href }: Pick<Options<P>, "href" | "props"> = {},
): string => {
  const ctx = useContext(SectionContext);
  if (typeof document !== "undefined") {
    throw new Error("Partials cannot be used inside an Island!");
  }

  if (!ctx) {
    throw new Error("Missing context in rendering tree");
  }

  const revisionId = ctx?.revision;
  const vary = ctx?.context.state.vary.build();
  const { request, renderSalt, context: { state: { pathTemplate } } } = ctx;

  const hrefParam = href ?? request.url;
  const stableHref = createStableHref(hrefParam);
  const cbString = [
    revisionId,
    vary,
    stableHref,
    ctx?.deploymentId,
  ].join("|");
  hasher.hash(cbString);
  const cb = hasher.result();
  hasher.reset();

  const params = new URLSearchParams([
    ["props", JSON.stringify(props)],
    ["href", stableHref],
    ["pathTemplate", pathTemplate],
    ["renderSalt", `${renderSalt ?? crypto.randomUUID()}`],
    ["__cb", `${cb}`],
  ]);

  if ((props as { __resolveType?: string })?.__resolveType === undefined) {
    params.set(
      "resolveChain",
      JSON.stringify(FieldResolver.minify(ctx.resolveChain.slice(0, -1))),
    );
  }

  return `/deco/render?${params}`;
};
