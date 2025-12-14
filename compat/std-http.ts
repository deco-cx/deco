/**
 * Shim for @std/http
 * Provides HTTP utilities compatible with Deno's std/http
 */

// Re-export cookie utilities from deps.ts (already cross-runtime)
export {
  getCookies,
  getSetCookies,
  setCookie,
  type Cookie,
} from "../deps.ts";

/**
 * User Agent parsing
 */
export interface UserAgent {
  browser: { name?: string; version?: string };
  device: { model?: string; type?: string; vendor?: string };
  engine: { name?: string; version?: string };
  os: { name?: string; version?: string };
  cpu: { architecture?: string };
}

export function userAgent(request: Request | Headers | string): UserAgent {
  const ua =
    typeof request === "string"
      ? request
      : request instanceof Headers
      ? request.get("user-agent") ?? ""
      : request.headers.get("user-agent") ?? "";

  // Basic parsing - for full parsing, use ua-parser-js
  const result: UserAgent = {
    browser: {},
    device: {},
    engine: {},
    os: {},
    cpu: {},
  };

  // Detect browser
  if (ua.includes("Chrome")) {
    result.browser.name = "Chrome";
    const match = ua.match(/Chrome\/([\d.]+)/);
    if (match) result.browser.version = match[1];
  } else if (ua.includes("Firefox")) {
    result.browser.name = "Firefox";
    const match = ua.match(/Firefox\/([\d.]+)/);
    if (match) result.browser.version = match[1];
  } else if (ua.includes("Safari")) {
    result.browser.name = "Safari";
    const match = ua.match(/Version\/([\d.]+)/);
    if (match) result.browser.version = match[1];
  }

  // Detect OS
  if (ua.includes("Windows")) {
    result.os.name = "Windows";
  } else if (ua.includes("Mac OS")) {
    result.os.name = "macOS";
  } else if (ua.includes("Linux")) {
    result.os.name = "Linux";
  } else if (ua.includes("Android")) {
    result.os.name = "Android";
  } else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) {
    result.os.name = "iOS";
  }

  // Detect device type
  if (ua.includes("Mobile")) {
    result.device.type = "mobile";
  } else if (ua.includes("Tablet") || ua.includes("iPad")) {
    result.device.type = "tablet";
  }

  return result;
}

/**
 * Content negotiation
 */
export interface Accepted {
  value: string;
  weight: number;
}

export function accepts(request: Request, ...types: string[]): string | undefined {
  const accept = request.headers.get("accept");
  if (!accept) return types[0];

  const parsed = parseAccept(accept);
  for (const { value } of parsed) {
    if (types.includes(value) || value === "*/*") {
      return types.find((t) => t === value || value === "*/*") ?? types[0];
    }
    // Check for type/* matches
    const [type] = value.split("/");
    const match = types.find((t) => t.startsWith(`${type}/`));
    if (match) return match;
  }

  return undefined;
}

export function acceptsEncodings(
  request: Request,
  ...encodings: string[]
): string | undefined {
  const accept = request.headers.get("accept-encoding");
  if (!accept) return encodings.includes("identity") ? "identity" : undefined;

  const parsed = parseAccept(accept);
  for (const { value } of parsed) {
    if (encodings.includes(value) || value === "*") {
      return encodings.find((e) => e === value || value === "*") ?? encodings[0];
    }
  }

  return encodings.includes("identity") ? "identity" : undefined;
}

export function acceptsLanguages(
  request: Request,
  ...languages: string[]
): string | undefined {
  const accept = request.headers.get("accept-language");
  if (!accept) return languages[0];

  const parsed = parseAccept(accept);
  for (const { value } of parsed) {
    if (languages.includes(value) || value === "*") {
      return languages.find((l) => l === value || value === "*") ?? languages[0];
    }
    // Check for language prefix match (e.g., en-US matches en)
    const [lang] = value.split("-");
    const match = languages.find((l) => l === lang || l.startsWith(`${lang}-`));
    if (match) return match;
  }

  return undefined;
}

function parseAccept(header: string): Accepted[] {
  return header
    .split(",")
    .map((part) => {
      const [value, ...params] = part.trim().split(";");
      let weight = 1;
      for (const param of params) {
        const [key, val] = param.trim().split("=");
        if (key === "q") {
          weight = parseFloat(val) || 0;
        }
      }
      return { value: value.trim(), weight };
    })
    .sort((a, b) => b.weight - a.weight);
}

/**
 * ETag generation
 */
export async function eTag(
  data: string | Uint8Array | ReadableStream<Uint8Array>,
  options?: { weak?: boolean },
): Promise<string> {
  let bytes: Uint8Array;

  if (typeof data === "string") {
    bytes = new TextEncoder().encode(data);
  } else if (data instanceof Uint8Array) {
    bytes = data;
  } else {
    // ReadableStream
    const chunks: Uint8Array[] = [];
    const reader = data.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    bytes = new Uint8Array(
      chunks.reduce((acc, chunk) => acc + chunk.length, 0),
    );
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
  }

  const hashBuffer = await crypto.subtle.digest("SHA-256", bytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  const tag = hashHex.slice(0, 27);

  return options?.weak ? `W/"${tag}"` : `"${tag}"`;
}

/**
 * If-None-Match / If-Match header handling
 */
export function ifNoneMatch(
  value: string | null,
  etag: string,
): boolean {
  if (!value) return false;

  const tags = value.split(",").map((t) => t.trim());
  const normalizedEtag = etag.replace(/^W\//, "");

  for (const tag of tags) {
    if (tag === "*") return true;
    const normalizedTag = tag.replace(/^W\//, "");
    if (normalizedTag === normalizedEtag) return true;
  }

  return false;
}

export function ifMatch(
  value: string | null,
  etag: string,
): boolean {
  if (!value) return true;

  const tags = value.split(",").map((t) => t.trim());

  for (const tag of tags) {
    if (tag === "*") return true;
    // Strong comparison (no W/ prefix)
    if (tag === etag && !tag.startsWith("W/")) return true;
  }

  return false;
}

/**
 * Status text mapping
 */
export const STATUS_TEXT: Record<number, string> = {
  100: "Continue",
  101: "Switching Protocols",
  200: "OK",
  201: "Created",
  202: "Accepted",
  204: "No Content",
  206: "Partial Content",
  301: "Moved Permanently",
  302: "Found",
  303: "See Other",
  304: "Not Modified",
  307: "Temporary Redirect",
  308: "Permanent Redirect",
  400: "Bad Request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not Found",
  405: "Method Not Allowed",
  409: "Conflict",
  410: "Gone",
  422: "Unprocessable Entity",
  429: "Too Many Requests",
  500: "Internal Server Error",
  501: "Not Implemented",
  502: "Bad Gateway",
  503: "Service Unavailable",
  504: "Gateway Timeout",
};

/**
 * Server-Sent Events Stream
 */
export class ServerSentEventStream extends TransformStream<
  ServerSentEvent,
  Uint8Array
> {
  constructor() {
    const encoder = new TextEncoder();
    super({
      transform(event, controller) {
        let data = "";
        if (event.id !== undefined) data += `id: ${event.id}\n`;
        if (event.event !== undefined) data += `event: ${event.event}\n`;
        if (event.retry !== undefined) data += `retry: ${event.retry}\n`;

        const eventData = typeof event.data === "string"
          ? event.data
          : JSON.stringify(event.data);

        for (const line of eventData.split("\n")) {
          data += `data: ${line}\n`;
        }
        data += "\n";

        controller.enqueue(encoder.encode(data));
      },
    });
  }
}

export interface ServerSentEvent {
  id?: string;
  event?: string;
  data: unknown;
  retry?: number;
}

/**
 * Create SSE response headers
 */
export function serverSentEventHeaders(): Headers {
  return new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
}

/**
 * MIME type detection
 */
export function contentType(extension: string): string | undefined {
  const ext = extension.startsWith(".") ? extension.slice(1) : extension;
  const types: Record<string, string> = {
    html: "text/html; charset=UTF-8",
    htm: "text/html; charset=UTF-8",
    css: "text/css; charset=UTF-8",
    js: "application/javascript; charset=UTF-8",
    mjs: "application/javascript; charset=UTF-8",
    json: "application/json; charset=UTF-8",
    xml: "application/xml",
    txt: "text/plain; charset=UTF-8",
    md: "text/markdown; charset=UTF-8",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    otf: "font/otf",
    pdf: "application/pdf",
    zip: "application/zip",
    mp3: "audio/mpeg",
    mp4: "video/mp4",
    webm: "video/webm",
    wasm: "application/wasm",
  };

  return types[ext.toLowerCase()];
}

