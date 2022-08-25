import { getSupabaseClientForUser } from "./supabase.ts";

export const updateComponentProps = async (req, ctx, { userOptions }) => {
  // req.referrer is undefined, so this trick is needed.
  // const referer = Object.values(req.headers.get("referer")).join("");
  let status;

  try {
    const { components, template } = await req.json();

    if (!userOptions.siteId) {
      // TODO: fetch site id from supabase
    }

    const res = await getSupabaseClientForUser(req).from("pages").update({
      components: components,
    }).match({ site: userOptions.siteId, path: template });

    status = res.status;
  } catch (e) {
    console.log(e);
  }

  const response = new Response(null, { status });
  return response;
};
