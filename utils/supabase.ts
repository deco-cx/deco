import { getSupabaseClientForUser } from "../supabase.ts";
import { Flag } from "../types.ts"

export const getSiteIdFromName = async (req: Request, siteName: string) => {
  const { data: Site, error } = await getSupabaseClientForUser(req)
    .from("sites")
    .select("id")
    .match({ name: siteName });

  if (error) {
    throw new Error(error.message);
  }

  return Site![0].id;
};

export const getPageFromId = async (
  req: Request,
  pageId: string,
  siteId: string,
) => {
  // Getting prod page in order to duplicate
  const { data: Pages, error } = await getSupabaseClientForUser(req)
    .from("pages")
    .select("*")
    .match({ id: pageId, site: siteId });

  if (error) {
    throw new Error(error.message);
  }

  if (Pages.length == 0) {
    throw new Error("page not found")
  }

  return Pages;
};

export const getFlagFromPageId = async (
  req: Request,
  pageId: string,
  siteId: string,
): Promise<Flag> => {
  // Getting prod page in order to duplicate

  const { data: Flags, error: error } = await getSupabaseClientForUser(req)
    .from("flags")
    .select(`id, name, audience, traffic, pages!inner(flag, id)`)
    .match({ "pages.id": pageId, site: siteId });

  if (error) {
    throw new Error(error.message);
  }

  if (Flags.length == 0) {
    throw new Error("flag not found")
  }

  return Flags[0] as Flag;
}

export const getFlagFromId = async (
  req: Request,
  flagId: string,
  siteId: string,
): Promise<Flag> => {
  // Getting prod page in order to duplicate
  const { data: Flags, error } = await getSupabaseClientForUser(req)
    .from("flags")
    .select("*")
    .match({ id: flagId, site: siteId });

  if (error) {
    throw new Error(error.message);
  }

  if (Flags.length == 0) {
    throw new Error("flag not found")
  }

  return Flags[0] as Flag;
};

export const getProdPage = async (
  req: Request,
  siteId: string,
  pathName: string,
  template: string | undefined,
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
  const { data: Pages, error } = await getSupabaseClientForUser(req)
    .from("pages")
    .select("*")
    .match({ site: siteId, archived: false })
    .is("flag", null)
    .or(queries);

  if (error) {
    throw new Error(error.message);
  }

  return Pages;
};

export const duplicateProdPage = async (
  req: Request,
  pathName: string,
  template: string,
  siteId: string,
): Promise<string> => {
  // Getting prod page in order to duplicate
  const pages = await getProdPage(req, siteId, pathName, template);

  // Create flag
  const flagResponse = await getSupabaseClientForUser(req)
    .from("flags")
    .insert({
      name: pages?.[0]?.name,
      audience: "",
      site: pages?.[0]?.site,
      traffic: 0,
    })


  if (flagResponse.error) {
    throw new Error(flagResponse.error.message);
  }

  // Insert the same prod page
  const pageResponse = await getSupabaseClientForUser(req)
    .from("pages")
    .insert({
      components: pages?.[0]?.components ?? [],
      path: pages?.[0]?.path ?? "",
      public: pages?.[0]?.public ?? false,
      name: pages?.[0]?.name,
      site: pages?.[0]?.site,
      archived: false,
      flag: flagResponse.data![0]!.id,
    });

  if (pageResponse.error) {
    throw new Error(pageResponse.error.message);
  }

  return pageResponse.data![0]!.id;
};
