import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  { var: state, req },
) => {
  // Parse request body to get the decofile
  let decofile;
  try {
    const body = await req.json();
    decofile = body.decofile;

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
  await state.release.set?.(decofile);

  return new Response(
    JSON.stringify({ success: true }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
});
