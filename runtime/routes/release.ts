import { getAllowedAuthorities } from "../../engine/trustedAuthority.ts";
import { allowCorsForOrigin } from "../../utils/http.ts";
import { stringifyWithoutSecrets } from "../../utils/secrets.ts";
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

  // `/.decofile` is reachable unauthenticated. Strip secret envelopes
  // (ciphertext + plaintext env-var name) and resolved Secret objects before
  // serializing so secret material is never disclosed to anonymous callers.
  return new Response(
    stringifyWithoutSecrets(await state.release.state()),
    { headers },
  );
});
