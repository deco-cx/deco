import { HandlerContext } from "$fresh/server.ts";
import getSupabaseClient, { getSupabaseClientForUser } from "./supabase.ts";
import type {
  Flag,
  PageSection,
  PageData,
  PageLoader,
  WithSchema,
} from "./types.ts";
import { createServerTiming } from "./utils/serverTimings.ts";
import { duplicateProdPage, getFlagFromPageId } from "./utils/supabase.ts";

const updateDraft = async (
  req: Request,
  ctx: EditorRequestData,
) => {
  const { sections, siteId, variantId, experiment, loaders } = ctx;

  let supabaseReponse;
  const pageId = variantId
    ? variantId
    // TODO: Fix this
    : await duplicateProdPage(siteId, 0);

  const flag: Flag = await getFlagFromPageId(pageId, siteId);
  flag.traffic = experiment ? 0.5 : 0;

  supabaseReponse = await getSupabaseClientForUser(req)
    .from("pages")
    .update({
      data: { sections, loaders },
    })
    .match({ id: pageId });

  if (supabaseReponse.error) {
    throw new Error(supabaseReponse.error.message);
  }

  supabaseReponse = await getSupabaseClientForUser(req)
    .from("flags")
    .update({
      traffic: flag.traffic,
    })
    .match({ id: flag.id });

  if (supabaseReponse.error) {
    throw new Error(supabaseReponse.error.message);
  }

  return { pageId, status: supabaseReponse.status };
};

const updateProd = async (
  req: Request,
  pathname: string,
  ctx: EditorRequestData & { pageId: number | string },
) => {
  const { template, siteId, pageId } = ctx;
  let supabaseResponse;

  const queries = [pathname, template]
    .filter((query) => Boolean(query))
    .map((query) => `path.eq.${query}`)
    .join(",");

  // Archive prod
  supabaseResponse = await getSupabaseClientForUser(req)
    .from("pages")
    .update({
      archived: true,
    })
    .match({ site: siteId })
    .is("flag", null)
    .is("archived", false)
    .or(queries);

  if (supabaseResponse.error) {
    throw new Error(supabaseResponse.error.message);
  }

  // Promote variant to prod
  supabaseResponse = await getSupabaseClientForUser(req)
    .from("pages")
    .update({
      archived: false,
      flag: null,
    })
    .eq("id", pageId);

  if (supabaseResponse.error) {
    throw new Error(supabaseResponse.error.message);
  }

  return { pageId, status: supabaseResponse.status };
};

export type Audience = "draft" | "public";

interface EditorRequestData {
  sections: PageSection[];
  loaders: PageLoader[];
  siteId: number;
  template?: string;
  experiment: number;
  audience: Audience;
  variantId: string | null;
}

export async function updateComponentProps(
  req: Request,
  _: HandlerContext<PageData>,
) {
  const { start, end, printTimings } = createServerTiming();
  const url = new URL(req.url);

  let response: { pageId: string | number; status: number } = {
    pageId: "",
    status: 0,
  };
  try {
    const ctx = (await req.json()) as EditorRequestData;

    start("saving-data");
    const { data: Pages, error } = await getSupabaseClient()
      .from("pages")
      .select("flag")
      .match({ id: ctx.variantId });

    const isProd = !Pages?.[0]!.flag;

    if (isProd) {
      ctx.variantId = null;
    }

    const referer = req.headers.get("referer");

    if (!referer && !ctx.template) {
      throw new Error("Referer or template not found");
    }

    const refererPathname = referer ? new URL(referer).pathname : "";
    const shouldDeployProd = !isProd && ctx.audience == "public" &&
      !ctx.experiment;
    response = await updateDraft(req, refererPathname, ctx);

    // Deploy production
    if (shouldDeployProd) {
      response = await updateProd(req, refererPathname, {
        ...ctx,
        pageId: response.pageId,
      });
    }
    end("saving-data");
  } catch (e) {
    console.error(e);
    response.status = 400;
  }

  return Response.json(
    { variantId: response.pageId },
    {
      status: response.status,
      headers: {
        "Server-Timing": printTimings(),
      },
    },
  );
}

export interface ComponentPreview
  extends Omit<PageSection, "uniqueId" | "props">, WithSchema {
  link: string;
}
