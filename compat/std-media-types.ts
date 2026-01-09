/**
 * Shim for @std/media-types
 * Provides MIME type utilities
 */

const MIME_TYPES: Record<string, string> = {
  // Text
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".csv": "text/csv",
  ".xml": "text/xml",
  ".md": "text/markdown",

  // JavaScript/TypeScript
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".ts": "text/typescript",
  ".tsx": "text/tsx",
  ".jsx": "text/jsx",

  // JSON
  ".json": "application/json",
  ".map": "application/json",
  ".jsonld": "application/ld+json",

  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",

  // Fonts
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",

  // Audio/Video
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",

  // Archives
  ".zip": "application/zip",
  ".gz": "application/gzip",
  ".tar": "application/x-tar",
  ".rar": "application/vnd.rar",

  // Documents
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // Other
  ".wasm": "application/wasm",
  ".bin": "application/octet-stream",
};

/**
 * Get MIME type for a file extension
 */
export function contentType(extOrPath: string): string | undefined {
  const ext = extOrPath.startsWith(".") ? extOrPath : `.${extOrPath.split(".").pop()}`;
  return MIME_TYPES[ext.toLowerCase()];
}

/**
 * Get file extension for a MIME type
 */
export function extension(mimeType: string): string | undefined {
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_TYPES)) {
    if (mime === baseMime) {
      return ext.slice(1);
    }
  }
  return undefined;
}

/**
 * Parse a media type string
 */
export function parseMediaType(
  mediaType: string,
): [string, Record<string, string>] | undefined {
  const parts = mediaType.split(";");
  const type = parts[0].trim();
  const params: Record<string, string> = {};

  for (let i = 1; i < parts.length; i++) {
    const [key, value] = parts[i].trim().split("=");
    if (key && value) {
      params[key.trim()] = value.trim().replace(/^["']|["']$/g, "");
    }
  }

  return [type, params];
}

/**
 * Format a media type with parameters
 */
export function formatMediaType(
  type: string,
  params?: Record<string, string>,
): string {
  let result = type;
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      result += `; ${key}=${value}`;
    }
  }
  return result;
}

