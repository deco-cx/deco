import { getAllowedAuthorities } from "../engine/trustedAuthority.ts";
import { allowCorsForOrigin } from "../utils/http.ts";

/**
 * Studio's editor reads `/.decofile` straight from the browser when it points
 * at a developer's own dev server (Studio's "Local" mode), so the Studio app
 * origins may read it cross-origin. They are not added to the trusted
 * authorities: that list also decides where a release may be fetched from.
 */
const STUDIO_HOSTNAMES = ["studio.decocms.com", "studio-stg.decocms.com"];

export const releaseCorsHeaders = (
  origin: string | null,
): Record<string, string> => {
  if (!origin || !URL.canParse(origin)) return {};
  const { hostname } = new URL(origin);
  const allowed = getAllowedAuthorities().includes(hostname) ||
    STUDIO_HOSTNAMES.includes(hostname);
  return allowed ? allowCorsForOrigin(origin) : {};
};
