import { Context } from "../../deco.ts";
import { createHandler } from "../middleware.ts";
import { releaseCorsHeaders } from "../releaseCors.ts";

export const handler = createHandler(async (
  { var: state, req },
) => {
  return new Response(
    JSON.stringify(await state.release.state()),
    {
      headers: {
        "Content-Type": "application/json",
        // The CORS headers below depend on the request's origin.
        "Vary": "Origin",
        ...releaseCorsHeaders(
          req.raw.headers.get("origin"),
          Context.active().platform === "localhost",
        ),
      },
    },
  );
});
