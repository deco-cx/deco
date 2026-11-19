import { getAllowedAuthorities } from "../engine/trustedAuthority.ts";
import { allowCorsForOrigin } from "../utils/http.ts";

/**
 * Studio's "Local" mode reads `/.decofile` from the developer's dev server in
 * the browser, so a local runtime also lets Studio's app origins read it.
 * They stay off the trusted authorities: that list also decides where a
 * release may be fetched from.
 */
const STUDIO_HOSTNAMES = ["studio.decocms.com", "studio-stg.decocms.com"];

export const releaseCorsHeaders = (
  origin: string | null,
  runtimeIsLocal: boolean,
  trustedAuthorities: string[] = getAllowedAuthorities(),
): Record<string, string> => {
  if (!origin || !URL.canParse(origin)) return {};
  const { hostname } = new URL(origin);
  const allowed = trustedAuthorities.includes(hostname) ||
    (runtimeIsLocal && STUDIO_HOSTNAMES.includes(hostname));
  return allowed ? allowCorsForOrigin(origin) : {};
};
