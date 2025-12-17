import { setCSPHeaders } from "../../utils/http.ts";
import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  { var: state, req },
) => {
  const response = new Response(
    JSON.stringify(await state.release.state()),
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
  return setCSPHeaders(req.raw, response);
});
