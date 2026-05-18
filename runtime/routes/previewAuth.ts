const ALLOWED_ORIGINS = [
  "https://admin.deco.cx",
  "http://localhost:3000", // local dev
  "http://localhost:8000",
];

/**
 * Checks whether a preview/render request originates from the admin editor.
 * Allows requests from admin.deco.cx, localhost dev servers, and requests
 * made directly on admin.deco.cx itself.
 */
export function isPreviewAllowed(req: Request): boolean {
  // Check Origin header (set on cross-origin requests from admin iframe/fetch)
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.some((o) => origin.startsWith(o))) {
    return true;
  }

  // Check Referer as fallback (for GET requests that don't send Origin)
  const referer = req.headers.get("referer");
  if (referer && ALLOWED_ORIGINS.some((o) => referer.startsWith(o))) {
    return true;
  }

  // Allow if the request IS on admin.deco.cx itself
  const host = req.headers.get("host") || "";
  if (host === "admin.deco.cx" || host.startsWith("localhost")) {
    return true;
  }

  return false;
}
