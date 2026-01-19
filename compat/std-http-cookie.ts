/**
 * Shim for @std/http/cookie
 * Provides cookie utilities
 */

export interface Cookie {
  name: string;
  value: string;
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  unparsed?: string[];
}

/**
 * Get cookies from request headers
 */
export function getCookies(headers: Headers): Record<string, string> {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return {};

  return Object.fromEntries(
    cookieHeader.split(";").map((cookie) => {
      const [name, ...valueParts] = cookie.trim().split("=");
      return [name, valueParts.join("=")];
    }),
  );
}

/**
 * Get Set-Cookie headers
 */
export function getSetCookies(headers: Headers): Cookie[] {
  const setCookieHeaders = headers.getSetCookie?.() ?? [];
  return setCookieHeaders.map(parseCookie);
}

function parseCookie(cookieStr: string): Cookie {
  const parts = cookieStr.split(";").map((p) => p.trim());
  const [nameValue, ...attributes] = parts;
  const [name, ...valueParts] = nameValue.split("=");
  const value = valueParts.join("=");

  const cookie: Cookie = { name, value };

  for (const attr of attributes) {
    const [attrName, attrValue] = attr.split("=").map((s) => s.trim());
    const lowerName = attrName.toLowerCase();

    switch (lowerName) {
      case "expires":
        cookie.expires = new Date(attrValue);
        break;
      case "max-age":
        cookie.maxAge = parseInt(attrValue, 10);
        break;
      case "domain":
        cookie.domain = attrValue;
        break;
      case "path":
        cookie.path = attrValue;
        break;
      case "secure":
        cookie.secure = true;
        break;
      case "httponly":
        cookie.httpOnly = true;
        break;
      case "samesite":
        cookie.sameSite = attrValue as Cookie["sameSite"];
        break;
    }
  }

  return cookie;
}

/**
 * Set a cookie on response headers
 */
export function setCookie(headers: Headers, cookie: Cookie): void {
  let str = `${cookie.name}=${cookie.value}`;

  if (cookie.expires) str += `; Expires=${cookie.expires.toUTCString()}`;
  if (cookie.maxAge !== undefined) str += `; Max-Age=${cookie.maxAge}`;
  if (cookie.domain) str += `; Domain=${cookie.domain}`;
  if (cookie.path) str += `; Path=${cookie.path}`;
  if (cookie.secure) str += "; Secure";
  if (cookie.httpOnly) str += "; HttpOnly";
  if (cookie.sameSite) str += `; SameSite=${cookie.sameSite}`;

  headers.append("Set-Cookie", str);
}

/**
 * Delete a cookie by setting it expired
 */
export function deleteCookie(
  headers: Headers,
  name: string,
  attributes?: { path?: string; domain?: string },
): void {
  setCookie(headers, {
    name,
    value: "",
    expires: new Date(0),
    path: attributes?.path,
    domain: attributes?.domain,
  });
}

