// Cloudflare's "cache: true" cache rule (and similar mechanisms on other CDNs)
// strips `Set-Cookie` from cached responses to prevent leaking one user's
// cookies via a shared cache entry. That defensive behavior breaks the
// framework's matcher / segment stickiness, because the variant cookie never
// reaches the browser on cache hits.
//
// CDNs strip headers but cannot strip body content. We mirror the framework's
// Set-Cookies into an inline `<script>document.cookie=...</script>` so the
// cookie survives even when the header is stripped.
//
// Important non-obvious bits:
//
// * We use `headers.getSetCookie()` (Web API, raw wire strings), NOT
//   `getSetCookies()` from @std/http (which parses + may decode). The browser
//   needs to send back the exact bytes the server will read with
//   `getCookies()` on the next request — round-trip identity matters more
//   than parsed form.
//
// * Cookie name/value are framework- or operator-controlled (matcher hash +
//   base64, flag names from CMS), but defense-in-depth: escape HTML special
//   chars before embedding in `<script>` so a maliciously-named flag cannot
//   break out of the tag.
//
// * Consequence — accepted: the first cold-cache visitor's variant becomes
//   everyone's variant within the cache window. This is correct for sticky
//   CSS/copy/banner A/B tests. It is WRONG for matchers that derive their
//   result from per-user identity — those must not declare `cacheable: true`.

import { DECO_MATCHER_PREFIX } from "../blocks/matcher.ts";
import { DECO_SEGMENT } from "./middleware.ts";

// Deferred to a getter to dodge a TDZ from the blocks/matcher.ts ↔
// runtime/middleware.ts circular import (same pattern as middleware.ts).
const frameworkCookiePrefixes = (): readonly string[] => [
  DECO_MATCHER_PREFIX,
  DECO_SEGMENT,
];

// 30 days. Matches the `expires` we set server-side in
// blocks/matcher.ts and runtime/middleware.ts.
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

const escapeForScript = (s: string): string =>
  s.replace(/</g, "\\u003c").replace(/>/g, "\\u003e");

/**
 * Build an inline `<script>` that calls `document.cookie=` for every
 * framework-managed Set-Cookie present on `headers`. Returns `null` when no
 * framework cookies are present (so callers can skip body buffering).
 */
export const buildClientCookieScript = (headers: Headers): string | null => {
  const setters: string[] = [];
  for (const raw of headers.getSetCookie()) {
    const semi = raw.indexOf(";");
    const nameValue = semi >= 0 ? raw.slice(0, semi) : raw;
    const eq = nameValue.indexOf("=");
    if (eq < 0) continue;
    const name = nameValue.slice(0, eq);
    if (!frameworkCookiePrefixes().some((p) => name.startsWith(p))) continue;
    const cookie =
      `${nameValue}; path=/; max-age=${MAX_AGE_SECONDS}; samesite=Lax`;
    setters.push(`document.cookie=${escapeForScript(JSON.stringify(cookie))};`);
  }
  if (setters.length === 0) return null;
  return `<script>${setters.join("")}</script>`;
};

/**
 * Inject `script` into `html` at the first `</head>` so the cookies are set
 * before the body parses (any body script that reads `document.cookie` sees
 * them). Falls back to `</body>`, then to append.
 *
 * Uses `indexOf` (first occurrence) rather than `lastIndexOf` so embedded
 * HTML (SVG `foreignObject`, mail templates rendered inline, etc.) cannot
 * trick us into injecting inside nested content.
 */
export const injectScriptIntoHtml = (html: string, script: string): string => {
  const idxHead = html.indexOf("</head>");
  if (idxHead >= 0) {
    return html.slice(0, idxHead) + script + html.slice(idxHead);
  }
  const idxBody = html.indexOf("</body>");
  if (idxBody >= 0) {
    return html.slice(0, idxBody) + script + html.slice(idxBody);
  }
  return html + script;
};
