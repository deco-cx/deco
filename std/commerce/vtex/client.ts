import { fetchAPI } from "$live/utils/fetchAPI.ts";
import {
  FacetSearchResult,
  LegacyFacets,
  LegacyProduct,
  LegacySort,
  ProductSearchResult,
  SearchArgs,
  SelectedFacet,
  Suggestion,
} from "./types.ts";

const POLICY_KEY = "trade-policy";
const REGION_KEY = "region-id";
const CHANNEL_KEYS = new Set([POLICY_KEY, REGION_KEY]);

export interface Options {
  platform: "vtex";
  defaultRegionId?: string;
  defaultHideUnnavailableItems?: boolean;
}

interface LegacyParams {
  ft?: string;
  fq?: string;
  _from?: number;
  _to?: number;
  O?: LegacySort;
  map?: string;
}

export const createClient = ({
  platform,
  defaultRegionId = "",
  defaultHideUnnavailableItems = false,
}: Options) => {
  const baseUrl = `https://vtex-search-proxy.global.ssl.fastly.net`;

  const addDefaultFacets = (
    facets: SelectedFacet[],
    { salesChannel = "1" }: Pick<
      SearchArgs,
      "salesChannel"
    >,
  ) => {
    const withDefaltFacets = facets.filter(({ key }) => !CHANNEL_KEYS.has(key));

    const policyFacet = facets.find(({ key }) => key === POLICY_KEY) ??
      { key: POLICY_KEY, value: salesChannel };

    const regionFacet = facets.find(({ key }) => key === REGION_KEY) ??
      { key: REGION_KEY, value: defaultRegionId };

    if (policyFacet !== null) {
      withDefaltFacets.push(policyFacet);
    }

    if (regionFacet !== null) {
      withDefaltFacets.push(regionFacet);
    }

    return withDefaltFacets;
  };

  const search = <T>({
    query = "",
    page,
    count,
    sort = "",
    selectedFacets = [],
    type,
    fuzzy = "auto",
    locale = "en-US",
    account,
    salesChannel,
  }: SearchArgs): Promise<T> => {
    const params = new URLSearchParams({
      page: (page + 1).toString(),
      count: count.toString(),
      query,
      sort,
      fuzzy,
      locale,
    });

    if (defaultHideUnnavailableItems !== undefined) {
      params.append(
        "hideUnavailableItems",
        defaultHideUnnavailableItems.toString(),
      );
    }

    const pathname = addDefaultFacets(selectedFacets, { salesChannel })
      .map(({ key, value }) => `${key}/${value}`)
      .join("/");

    return fetchAPI(
      `${baseUrl}/v2/${account}/api/io/_v/api/intelligent-search/${type}/${pathname}?${params.toString()}`,
    );
  };

  const products = (args: Omit<SearchArgs, "type">) =>
    search<ProductSearchResult>({ ...args, type: "product_search" });

  const suggestedTerms = (
    { query, account, locale = "en-US" }: Omit<SearchArgs, "type">,
  ): Promise<Suggestion> => {
    const params = new URLSearchParams({
      query: query?.toString() ?? "",
      locale,
    });

    return fetchAPI(
      `${baseUrl}/v2/${account}/api/io/_v/api/intelligent-search/search_suggestions?${params.toString()}`,
    );
  };

  const topSearches = (
    { account, locale = "en-US" }: Pick<SearchArgs, "account" | "locale">,
  ): Promise<Suggestion> => {
    const params = new URLSearchParams({
      locale,
    });

    return fetchAPI(
      `${baseUrl}/v2/${account}/api/io/_v/api/intelligent-search/top_searches?${params.toString()}`,
    );
  };

  const facets = (args: Omit<SearchArgs, "type">) =>
    search<FacetSearchResult>({ ...args, type: "facets" });

  const withLegacyParams = (
    url: URL,
    params: LegacyParams,
  ) => {
    for (const key of Object.keys(params)) {
      const value = params[key as keyof LegacyParams]?.toString();

      if (value) {
        url.searchParams.set(key, value);
      }
    }

    return url;
  };

  const legacyProducts = (
    { account, term, ...params }: {
      account: string;
      term?: string;
    } & LegacyParams,
  ) => {
    const url = withLegacyParams(
      new URL(
        `/v2/${account}/api/catalog_system/pub/products/search/${term ?? ""}`,
        baseUrl,
      ),
      params,
    );

    return fetchAPI<LegacyProduct[]>(url.href);
  };

  const legacyFacets = (
    { account, term, ...params }:
      & { account: string; term: string }
      & LegacyParams,
  ) => {
    const url = withLegacyParams(
      new URL(
        `/v2/${account}/api/catalog_system/pub/facets/search/${term ?? ""}`,
        baseUrl,
      ),
      params,
    );

    return fetchAPI<LegacyFacets>(url.href);
  };

  const pageType = ({ account, slug }: { account: string; slug: string }) => {
    return fetchAPI(
      `${baseUrl}/v2/${account}/api/catalog_system/pub/portal/pagetype/${slug}`,
    );
  };

  return {
    platform,
    search: {
      facets,
      products,
      suggestedTerms,
      topSearches,
    },
    catalog_system: {
      products: legacyProducts,
      facets: legacyFacets,
      pageType,
    },
  };
};
