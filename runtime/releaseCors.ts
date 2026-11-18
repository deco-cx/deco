import { getAllowedAuthorities } from "../engine/trustedAuthority.ts";
import { allowCorsForOrigin } from "../utils/http.ts";

/**
 * On a local runtime any origin may read the release cross-origin, the same
 * as `/live/_meta`: Studio's "Local" mode reads `/.decofile` from the
 * developer's dev server in the browser. Elsewhere only the trusted
 * authorities may.
 */
export const releaseCorsHeaders = (
  origin: string | null,
  runtimeIsLocal: boolean,
): Record<string, string> => {
  if (!origin || !URL.canParse(origin)) return {};
  const allowed = runtimeIsLocal ||
    getAllowedAuthorities().includes(new URL(origin).hostname);
  return allowed ? allowCorsForOrigin(origin) : {};
};
