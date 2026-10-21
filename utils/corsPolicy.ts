import { getAllowedAuthorities } from "../engine/trustedAuthority.ts";
import { isAdmin } from "./admin.ts";

/**
 * Whether `origin` may read this site's decofile cross-origin.
 *
 * Two lists answer that, and they are not the same question:
 *
 * - `adminDomains` — the CMS surfaces that edit this site. This is the one a
 *   browser-side CMS belongs on, and the one `batchInvoke` already honours.
 * - `getAllowedAuthorities()` — where a decofile may be fetched FROM
 *   (`assertAllowedAuthority`, used by `engine/decofile/fetcher.ts`). It is
 *   consulted here for historical reasons.
 *
 * Honouring only the second is what kept Studio (`studio.decocms.com`, on the
 * first list since it shipped) from reading `/.decofile` over a dev tunnel,
 * while `/live/_meta` — which allows any origin — worked.
 */
export const mayReadDecofile = (origin: string | null): boolean => {
  if (!origin || !URL.canParse(origin)) return false;
  if (isAdmin(origin)) return true;
  return getAllowedAuthorities().includes(new URL(origin).hostname);
};
