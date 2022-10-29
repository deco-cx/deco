import { Context } from "https://esm.sh/v96/preact@10.11.1/src/index.d.ts";
import { context } from "../server.ts";
import getSupabaseClient from "../supabase.ts";
import { Flag, Page, PageComponent, PageLoader } from "../types.ts";
import { appendHash } from "./loaders.ts";

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

export const fetchPageFromId = async (
  pageId: number,
  siteId: number
): Promise<Page> => {
  const { data: pages, error } = await getSupabaseClient()
    .from("pages")
    .select("id, name, data, path")
    .match({ id: pageId });

  const match = pages?.[0];

  if (error || !match) {
    throw new Error(error?.message || `Page with id ${pageId} not found`);
  }

  return match as Page;
};

export const getFlagFromPageId = async (
  pageId: string,
  siteId: number
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

// export const getFlagFromId = async (
//   flagId: string,
//   siteId: string,
// ): Promise<Flag> => {
//   // Getting prod page in order to duplicate
//   const { data: Flags, error } = await getSupabaseClient()
//     .from("flags")
//     .select("*")
//     .match({ id: flagId, site: siteId });

//   if (error) {
//     throw new Error(error.message);
//   }

//   if (Flags.length == 0) {
//     throw new Error("flag not found");
//   }

//   return Flags[0] as Flag;
// };

export const fetchPageFromPathname = async (
  path: string,
  siteId: number
): Promise<Page> => {
  // TODO: If page has dynamic params, query all prod pages and run
  // matchPath
  const __pathToLookFor = path.endsWith("/p") ? "/:slug/p" : path;

  /**
   * Queries follow PostgREST syntax
   * https://postgrest.org/en/stable/api.html#horizontal-filtering-rows
   */

  const { data: Pages, error } = await getSupabaseClient()
    .from("pages")
    .select("id, name, data, path")
    .match({ site: siteId, archived: false })
    .is("flag", null)
    .is("archived", false)
    .eq("path", __pathToLookFor);

  const match = Pages?.[0];

  if (error || !match) {
    throw new Error(error?.message || `Page with path "${path}" not found`);
  }

  return match as Page;
};

export const duplicateProdPage = async (
  pageId: number,
  siteId: number
): Promise<string> => {
  // Getting prod page in order to duplicate
  const page = await fetchPageFromId(pageId, siteId);

  // Create flag
  const flagResponse = await getSupabaseClient().from("flags").insert({
    name: page?.name,
    audience: "",
    site: siteId,
    traffic: 0,
  });

  if (flagResponse.error) {
    throw new Error(flagResponse.error.message);
  }

  // Insert the same prod page
  const pageResponse = await getSupabaseClient()
    .from("pages")
    .insert({
      ...page,
      archived: false,
      flag: flagResponse.data![0]!.id,
    });

  if (pageResponse.error) {
    throw new Error(pageResponse.error.message);
  }

  return pageResponse.data![0]!.id;
};

export const ___tempMigratePageData = async (page: Page): Promise<Page> => {
  const newComponents = page?.data?.components.map((c): PageComponent => {
    const oldComponent = c as unknown as { component: string };
    const oldComponentKey = oldComponent?.component;

    const __componentKeyInManifest = `./components/${oldComponentKey}.tsx`;

    const __islandKeyInManifest = `./islands/${oldComponentKey}.tsx`;

    const key = context.manifest?.islands[__islandKeyInManifest]
      ? __islandKeyInManifest
      : __componentKeyInManifest;

    return {
      key,
      label: oldComponentKey,
      uniqueId: appendHash(oldComponentKey),
      props: c.props,
    };
  });
  const newLoaders = page?.data?.loaders.map((loader) => {
    const oldLoader = loader as unknown as {
      loader: string;
      name: string;
      props: Record<string, any>;
    };
    const key = `./loaders/${oldLoader.loader}.ts`;
    const uniqueId = oldLoader.name;
    const label = "VTEX - Search Products";
    const outputSchema =
      context?.manifest?.loaders[key]?.default?.outputSchema
        ?.$ref;

    return {
      key,
      label,
      outputSchema,
      uniqueId,
      props: loader.props,
    } as PageLoader;
  });

  const newData = { components: newComponents, loaders: newLoaders };
  const { data: pages, error } = await getSupabaseClient()
    .from("pages")
    .update({ data: newData })
    .match({ id: page?.id });

  const match = pages?.[0];

  if (error || !match) {
    throw new Error(error?.message || `Unable to update `);
  }

  return { ...page, data: newData } as Page;
};
