import { getAllowedAuthorities } from "../../engine/trustedAuthority.ts";
import { allowCorsForOrigin } from "../../utils/http.ts";
import { createHandler } from "../middleware.ts";

export const handler = createHandler(async (
  { var: state, req },
) => {
  const origin = req.raw.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (origin && URL.canParse(origin)) {
    const originUrl = new URL(origin);
    const allowedAuthorities = getAllowedAuthorities();
    if (allowedAuthorities.includes(originUrl.hostname)) {
      Object.assign(headers, allowCorsForOrigin(origin));
    }
  }

  return new Response(
    JSON.stringify(await state.release.state()),
    { headers },
  );
});
