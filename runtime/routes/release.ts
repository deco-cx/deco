import { mayReadDecofile } from "../../utils/corsPolicy.ts";
import { allowCorsForOrigin } from "../../utils/http.ts";
import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  { var: state, req },
) => {
  const origin = req.raw.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (origin && mayReadDecofile(origin)) {
    Object.assign(headers, allowCorsForOrigin(origin));
  }

  return new Response(
    JSON.stringify(await state.release.state()),
    { headers },
  );
});
