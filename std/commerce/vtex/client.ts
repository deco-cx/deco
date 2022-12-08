import { fetchAPI } from "$live/utils/fetchAPI.ts";

export interface ProductLocator {
  field: "id" | "slug";
  value: string;
}

const POLICY_KEY = "trade-policy";
const REGION_KEY = "region-id";
const CHANNEL_KEYS = new Set([POLICY_KEY, REGION_KEY]);

export interface Options {
  platform: "vtex";
  account: string;
  defaultLocale?: string;
  defaultSalesChannel?: string | number;
  defaultRegionId?: string;
  defaultHideUnnavailableItems?: boolean;
}

export const createClient = ({
  platform,
  account,
  defaultLocale = "en-US",
  defaultSalesChannel = 1,
  defaultRegionId = "",
  defaultHideUnnavailableItems = false,
}: Options) => {
  const baseUrl = `https://vtex-search-proxy.global.ssl.fastly.net/${account}`;

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
  }: SearchArgs): Promise<T> => {
    const params = new URLSearchParams({
      page: (page + 1).toString(),
      count: count.toString(),
      query,
      sort,
      fuzzy,
      locale: ctx.storage.locale,
    });

    if (hideUnavailableItems !== undefined) {
      params.append("hideUnavailableItems", hideUnavailableItems.toString());
    }

    const pathname = addDefaultFacets(selectedFacets)
      .map(({ key, value }) => `${key}/${value}`)
      .join("/");

    return fetchAPI(
      `${base}/_v/api/intelligent-search/${type}/${pathname}?${params.toString()}`,
    );
  };

  const products = (args: Omit<SearchArgs, "type">) =>
    search<ProductSearchResult>({ ...args, type: "product_search" });

  const suggestedTerms = (
    args: Omit<SearchArgs, "type">,
  ): Promise<Suggestion> => {
    const params = new URLSearchParams({
      query: args.query?.toString() ?? "",
      locale: ctx.storage.locale,
    });

    return fetchAPI(
      `${base}/_v/api/intelligent-search/search_suggestions?${params.toString()}`,
    );
  };

  const topSearches = (): Promise<Suggestion> => {
    const params = new URLSearchParams({
      locale: ctx.storage.locale,
    });

    return fetchAPI(
      `${base}/_v/api/intelligent-search/top_searches?${params.toString()}`,
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

export const isFacetBoolean = (
  facet: Facet,
): facet is Facet<FacetValueBoolean> => facet.type === "TEXT";
