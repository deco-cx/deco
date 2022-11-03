import getSupabaseClient from "../supabase.ts";
import { Flag, Page } from "../types.ts";
import {
  createComponent,
  createPageForComponent,
  exists,
} from "./component.ts";
import { fetchPageFromId } from "../pages.ts";

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

/**
 * Fetches a page containing this component.
 *
 * This is used for creating the canvas. It retrieves
 * or generates a fake page from the database at
 * /_live/components/<componentName.tsx>
 *
 * This way we can use the page editor to edit components too
 */
export const fetchPageFromComponent = async (
  component: string, // Ex: Banner.tsx
) => {
  const supabase = getSupabaseClient();
  const { component: instance, loaders } = createComponent(
    `./components/${component}`,
  );
  const page = createPageForComponent(component, {
    components: [instance],
    loaders,
  });

  if (!exists(`./components/${component}`)) {
    throw new Error(`Component at ${component} Not Found`);
  }

  const { data } = await supabase
    .from<Page>("pages")
    .select("id, path")
    .match({ path: page.path });

  const match = data?.[0];

  if (match) {
    return fetchPageFromId(match.id);
  }

  return page;
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

export const duplicateProdPage = async (
  pageId: number,
  siteId: number
): Promise<string> => {
  // Getting prod page in order to duplicate
  const { page } = await fetchPageFromId(pageId);

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
