import { getCookies, setCookie } from "std/http/mod.ts";

const DECO_COOKIE = "dcxf_";

export const cookies = {
  getFlags: (headers: Headers) => {
    const cookies = getCookies(headers);
    const flags: CookiedFlag[] | undefined = Object.keys(cookies)
      .filter((cookie) => cookie.startsWith(DECO_COOKIE))
      .map((cookie) => JSON.parse(atob(cookies[cookie])));

    if (!flags) {
      return null;
    }

    const flagSet = new Map<string, CookiedFlag>();
    for (const flag of flags) {
      flagSet.set(flag.key, flag);
    }

    return flagSet;
  },
  setFlags: (headers: Headers, flags: CookiedFlag[]) => {
    for (const flag of flags) {
      const name = `${DECO_COOKIE}${flag.key}`;
      const value = btoa(JSON.stringify(flag));

      setCookie(headers, { name, value });
    }
  },
};

export interface CookiedFlag {
  key: string;
  isMatch: boolean;
  // deno-lint-ignore no-explicit-any
  value: any;
  updated_at: string;
}
