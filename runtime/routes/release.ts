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
        ...releaseCorsHeaders(req.raw.headers.get("origin")),
      },
    },
  );
});
