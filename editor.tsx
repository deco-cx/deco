import { HandlerContext } from "$fresh/server.ts";
import { getSupabaseClientForUser } from "./supabase.ts";

type Options = {
  userOptions: {
    siteId: number;
  };
};

export const updateComponentProps = async (
  req: Request,
  _: HandlerContext,
  { userOptions }: Options,
) => {
  // req.referrer is undefined, so this trick is needed.
  // const referer = Object.values(req.headers.get("referer")).join("");
  let status;

  try {
    const { components, template } = await req.json();

    if (!userOptions.siteId) {
      // TODO: fetch site id from supabase
    }

    // TODO: Validate components props on schema

    const res = await getSupabaseClientForUser(req).from("pages").update({
      components: components,
    }).match({ site: userOptions.siteId, path: template });

    status = res.status;
  } catch (e) {
    console.log(e);
  }

  return new Response(null, { status });
};
