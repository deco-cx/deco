import { Cookie, setCookie as stdSetCookie } from "std/http/cookie.ts";

export const MAX_COOKIE_SIZE = 4096; // 4KB

export const getCookieSize = (cookie: string) => {
  // Each character in a JavaScript string is UTF-16, taking up 2 bytes
  return cookie.length * 2;
};

interface SetCookieOptions {
  // Encoding a cookie is important to ensure special characters
  // do not interfere with cookie parsing and to prevent the injection
  // of malicious content, enhancing data security and integrity.
  encode?: boolean;
  // This option is used to bypass the 4KB cookie size limit.
  dangerouslySetBigCookies?: boolean;
}

export function setCookie(
  headers: Headers,
  cookie: Cookie,
  cookieOptions?: SetCookieOptions,
): void {
  const { encode = false, dangerouslySetBigCookies = false } = cookieOptions ??
    {};

  const newCookie = {
    ...cookie,
  };

  if (encode) {
    newCookie.value = btoa(encodeURIComponent(cookie.value));
  }

  // could have an error range, because deno's cookie uses their own toString function
  const stringLength = newCookie.name.length + newCookie.value.length;

  if (!dangerouslySetBigCookies) {
    const sizeInBytes = stringLength * 2;
    if (sizeInBytes > MAX_COOKIE_SIZE) {
      console.warn(
        `Cookie '${cookie.name}' exceeds the size limit of 4KB and will not be set.`,
      );
      return;
    }
  }

  stdSetCookie(headers, newCookie);
}

export function decodeCookie(cookie: string): string {
  return decodeURIComponent(atob(cookie));
}
