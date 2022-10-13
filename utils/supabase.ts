import getSupabaseClient from "../supabase.ts";
import { Flag } from "../types.ts";

export const getSiteIdFromName = async (siteName: string) => {
  const { data: Site, error } = await getSupabaseClient()
    .from("sites")
    .select("id")
    .match({ name: siteName });

  if (error) {
    throw new Error(error.message);
  }

  return Site![0].id;
};

export const getPageFromId = async (
  pageId: string,
  siteId: string,
) => {
  // Getting prod page in order to duplicate
  const { data: Pages, error } = await getSupabaseClient()
    .from("pages")
    .select("*")
    .match({ id: pageId, site: siteId });

  if (error) {
    throw new Error(error.message);
  }

  if (Pages.length == 0) {
    throw new Error("page not found");
  }

  return Pages;
};

export const getFlagFromPageId = async (
  pageId: string,
  siteId: number,
): Promise<Flag> => {
  // Getting prod page in order to duplicate

  const { data: Flags, error: error } = await getSupabaseClient()
    .from("flags")
    .select(`id, name, audience, traffic, pages!inner(flag, id)`)
    .match({ "pages.id": pageId, site: siteId });

  if (error) {
    throw new Error(error.message);
  }

  if (Flags.length == 0) {
    throw new Error("flag not found");
  }

  return Flags[0] as Flag;
};

export const getFlagFromId = async (
  flagId: string,
  siteId: string,
): Promise<Flag> => {
  // Getting prod page in order to duplicate
  const { data: Flags, error } = await getSupabaseClient()
    .from("flags")
    .select("*")
    .match({ id: flagId, site: siteId });

  if (error) {
    throw new Error(error.message);
  }

  if (Flags.length == 0) {
    throw new Error("flag not found");
  }

  return Flags[0] as Flag;
};

export const getProdPage = async (
  siteId: number,
  pathName: string,
  template?: string,
) => {
  /**
   * Queries follow PostgREST syntax
   * https://postgrest.org/en/stable/api.html#horizontal-filtering-rows
   */
  const queries = [pathName, template]
    .filter((query) => Boolean(query))
    .map((query) => `path.eq.${query}`)
    .join(",");

  // TODO: Ensure pages list are correct (only 1 prod and flags list)
  const { data: Pages, error } = await getSupabaseClient()
    .from("pages")
    .select("*")
    .match({ site: siteId, archived: false })
    .is("flag", null)
    .is("archived", false)
    .or(queries);

  if (error) {
    throw new Error(error.message);
  }

  return Pages;
};

export const duplicateProdPage = async (
  pathName: string,
  template: string | undefined,
  siteId: number,
): Promise<string> => {
  // Getting prod page in order to duplicate
  const [prodPage] = await getProdPage(siteId, pathName, template);

  // Create flag
  const flagResponse = await getSupabaseClient()
    .from("flags")
    .insert({
      name: prodPage?.name,
      audience: "",
      site: prodPage?.site,
      traffic: 0,
    });

  if (flagResponse.error) {
    throw new Error(flagResponse.error.message);
  }

  // Insert the same prod page
  const pageResponse = await getSupabaseClient()
    .from("pages")
    .insert({
      data: prodPage?.data ?? {},
      full_name: prodPage['full_name'],
      path: prodPage?.path ?? "",
      public: prodPage?.public ?? false,
      name: prodPage?.name,
      site: prodPage?.site,
      archived: false,
      flag: flagResponse.data![0]!.id,
    });

  if (pageResponse.error) {
    throw new Error(pageResponse.error.message);
  }

  return pageResponse.data![0]!.id;
};
