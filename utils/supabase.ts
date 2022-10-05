import { getSupabaseClientForUser } from "../supabase.ts";

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
) => {
  // Getting prod page in order to duplicate
  const { data: Pages, error } = await getSupabaseClientForUser(req)
    .from("pages")
    .select("*")
    .match({ id: pageId });

  if (error) {
    throw new Error(error.message);
  }

  if (Pages.length == 0) {
    throw new Error("page not found")
  }

  return Pages;
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

  // Insert the same prod page
  const { data: id, error } = await getSupabaseClientForUser(req)
    .from("pages")
    .insert({
      components: pages?.[0]?.components ?? [],
      path: pages?.[0]?.path ?? "",
      public: pages?.[0]?.public ?? false,
      name: pages?.[0]?.name,
      site: pages?.[0]?.site,
      archived: false,
      // TODO: Create flag and get ID
      flag: 1,
    });

  if (error) {
    throw new Error(error.message);
  }

  return id![0]!.id;
};
