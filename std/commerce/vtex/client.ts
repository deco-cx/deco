import { fetchAPI } from "$live/utils/fetchAPI.ts";
import {
  FacetSearchResult,
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
  defaultLocale?: string;
  defaultSalesChannel?: string;
  defaultRegionId?: string;
  defaultHideUnnavailableItems?: boolean;
}

export const createClient = ({
  platform,
  defaultLocale = "en-US",
  defaultSalesChannel = "1",
  defaultRegionId = "",
  defaultHideUnnavailableItems = false,
}: Options) => {
  const baseUrl = `https://vtex-search-proxy.global.ssl.fastly.net/`;

  const addDefaultFacets = (facets: SelectedFacet[]) => {
    const withDefaltFacets = facets.filter(({ key }) => !CHANNEL_KEYS.has(key));

    const policyFacet = facets.find(({ key }) => key === POLICY_KEY) ??
      { key: POLICY_KEY, value: defaultSalesChannel };

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
    locale = defaultLocale,
    account,
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

    const pathname = addDefaultFacets(selectedFacets)
      .map(({ key, value }) => `${key}/${value}`)
      .join("/");

    return fetchAPI(
      `${baseUrl}/${account}/intelligent-search/${type}/${pathname}?${params.toString()}`,
    );
  };

  const products = (args: Omit<SearchArgs, "type">) =>
    search<ProductSearchResult>({ ...args, type: "product_search" });

  const suggestedTerms = (
    { query, account }: Omit<SearchArgs, "type">,
  ): Promise<Suggestion> => {
    const params = new URLSearchParams({
      query: query?.toString() ?? "",
      locale: defaultLocale,
    });

    return fetchAPI(
      `${baseUrl}/${account}/intelligent-search/search_suggestions?${params.toString()}`,
    );
  };

  const topSearches = (
    { account }: Pick<SearchArgs, "account">,
  ): Promise<Suggestion> => {
    const params = new URLSearchParams({
      locale: defaultLocale,
    });

    return fetchAPI(
      `${baseUrl}/${account}/intelligent-search/top_searches?${params.toString()}`,
    );
  };

  const facets = (args: Omit<SearchArgs, "type">) =>
    search<FacetSearchResult>({ ...args, type: "facets" });

  return {
    platform,
    search: {
      facets,
      products,
      suggestedTerms,
      topSearches,
    },
  };
};
