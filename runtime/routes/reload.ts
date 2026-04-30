import { createHandler } from "../middleware.ts";

const RELOAD_TOKEN = Deno.env.get("DECO_RELOAD_TOKEN");
export const handler = createHandler(async (
  { var: state, req },
) => {
  // Parse request body to get the decofile
  const token = req.header("Authorization")?.split(" ")[1];
  if (RELOAD_TOKEN && token !== RELOAD_TOKEN) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      {
        status: 401,
      },
    );
  }
  let decofile;
  let revision;
  try {
    const body = await req.json();
    decofile = body.decofile;
    revision = body.timestamp;

    if (!decofile) {
      return new Response(
        JSON.stringify({ error: "Missing decofile in request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }
  } catch (_error) {
    return new Response(
      JSON.stringify({ error: "Invalid JSON in request body" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }

  // Set the new decofile
  await state.release.set?.(decofile, `${revision}`);

  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
