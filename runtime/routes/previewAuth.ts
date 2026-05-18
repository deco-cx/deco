const ALLOWED_ORIGINS = [
  "https://admin.deco.cx",
  "https://admin.decocms.com",
  "https://deco.cx",
  "https://decocms.com",
  "http://localhost:3000", // local dev
  "http://localhost:8000",
];

function safeOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Checks whether a preview/render request originates from the admin editor.
 * Allows requests from admin.deco.cx, localhost dev servers, and requests
 * made directly on admin.deco.cx itself.
 */
export function isPreviewAllowed(req: Request): boolean {
  // Check Origin header (set on cross-origin requests from admin iframe/fetch)
  const origin = safeOrigin(req.headers.get("origin") ?? "");
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    return true;
  }

  // Check Referer as fallback (for GET requests that don't send Origin)
  const referer = safeOrigin(req.headers.get("referer") ?? "");
  if (referer && ALLOWED_ORIGINS.includes(referer)) {
    return true;
  }

  // Allow if the request IS on an allowed host
  const host = req.headers.get("host") || "";
  if (
    host === "admin.deco.cx" ||
    host === "admin.decocms.com" ||
    host.endsWith(".deco.cx") ||
    host.endsWith(".decocms.com") ||
    host.startsWith("localhost")
  ) {
    return true;
  }

  return false;
}
