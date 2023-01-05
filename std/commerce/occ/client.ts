import { fetchAPI } from "$live/utils/fetchAPI.ts";
import { OccProductPage, OccSearch } from "./types.ts";

export interface Options {
  platform: "occ";
  baseUrl: string;
  // TOOD: Don't know yet what it means
  nrpp?: string;
}

export const createClient = ({
  platform,
  baseUrl,
  nrpp = "12",
}: Options) => {
  const searchByTerm = (term: string) => {
    return fetchAPI<OccSearch>(
      `${baseUrl}/ccstoreui/v1/search?Ntt=${term}&Nrpp=${nrpp}`,
    );
  };

  const productBySlug = (slug: string) => {
    return fetchAPI<OccProductPage>(
      `${baseUrl}/ccstoreui/v1/pages/produto/${slug}?dataOnly=false&cacheableDataOnly=true&productTypesRequired=false`,
    );
  };

  return {
    platform,
    search: {
      searchByTerm,
      productBySlug,
    },
  };
};
