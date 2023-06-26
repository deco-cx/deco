import { getCookies, setCookie } from "std/http/mod.ts";

const DECO_COOKIE = "dcxf_";

const flagName = (flagKey: string) => `${DECO_COOKIE}${flagKey}`;
export const cookies = {
  pruneFlags: (headers: Headers, flags: Map<string, CookiedFlag>) => {
    for (const flag of flags.values()) {
      setCookie(headers, {
        name: flagName(flag.key),
        value: "",
        expires: new Date("Thu, 01 Jan 1970 00:00:00 UTC"),
      });
    }
  },
  getFlags: (headers: Headers) => {
    const cookies = getCookies(headers);
    const flags: CookiedFlag[] | undefined = Object.keys(cookies)
      .filter((cookie) => cookie.startsWith(DECO_COOKIE))
      .map((cookie) => {
        try {
          return JSON.parse(atob(cookies[cookie]));
        } catch (err) {
          console.error("error parsing cookies", err)
          return undefined;
        }
      })
      .filter(Boolean);

    if (!flags) {
      return null;
    }

    const flagSet = new Map<string, CookiedFlag>();
    for (const flag of flags) {
      flagSet.set(flag.key, flag);
    }

    return flagSet;
  },
  setFlags: (
    headers: Headers,
    flags: CookiedFlag[],
  ) => {
    for (const flag of flags) {
      const name = flagName(flag.key);
      const value = btoa(JSON.stringify(flag));

      setCookie(headers, { name, value });
    }
  },
};

export interface CookiedFlag {
  key: string;
  isMatch: boolean;
  updated_at: string;
}
