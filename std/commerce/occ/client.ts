import { fetchAPI } from "$live/utils/fetchAPI.ts";
import {
  CategorySearchResult,
  OccProductPage,
  OccSearch,
  ProductSkuInventoryStatus,
} from "./types.ts";

export interface Options {
  platform: "occ";
  baseUrl: string;
  // TOOD: Don't know yet what it means
  nrpp?: string;
}

export interface SearchCategoryArgs {
  categoryId: string;
  catalogId?: string;
  limit?: number;
  offset?: number;
}

export const createClient = ({ platform, baseUrl, nrpp = "12" }: Options) => {
  const searchByTerm = (term: string) => {
    return fetchAPI<OccSearch>(
      `${baseUrl}/ccstoreui/v1/search?Ntt=${term}&Nrpp=${nrpp}`
    );
  };

  const productBySlug = (slug: string) => {
    return fetchAPI<OccProductPage>(
      `${baseUrl}/ccstoreui/v1/pages/produto/${slug}?dataOnly=false&cacheableDataOnly=true&productTypesRequired=false`
    );
  };

  const searchByCategory = ({
    catalogId = "cloudCatalog",
    categoryId,
    limit = 16,
    offset = 0,
  }: SearchCategoryArgs) => {
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      catalogId,
      categoryId,
    });

    return fetchAPI<CategorySearchResult>(
      `${baseUrl}/ccstoreui/v1/products?${params.toString()}`
    );
  };

  const stockStatus = (productId: string) => {
    return fetchAPI<ProductSkuInventoryStatus>(
      `${baseUrl}/ccstoreui/v1/stockStatus/${productId}`
    );
  };

  return {
    platform,
    search: {
      searchByTerm,
      productBySlug,
      searchByCategory,
      stockStatus,
    },
  };
};
