import { HandlerContext } from "$fresh/server.ts";
import { DecoManifest, Flag, LiveState } from "$live/types.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";
import { EffectFunction, MatchFunction } from "$live/std/types.ts";
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

interface CookiedFlag {
  key: string;
  isMatch: boolean;
  value: any;
  updated_at: string;
}

let flags: Flag[];
export const flag = (id: string) => flags.find((flag) => flag.id === id);

const runFlagMatchers = <D>(
  flag: Flag,
  req: Request,
  ctx: HandlerContext<D, LiveState>,
) => {
  const manifest = context.manifest as DecoManifest;
  const { data: { matches } } = flag;

  for (const match of matches) {
    const { key, props } = match;

    const matchFn: MatchFunction<any, any, any> = manifest.functions[key]
      ?.default as MatchFunction;

    if (!matchFn) {
      console.error("No match function found for key: " + key);
      return { isMatch: false, duration: "request" };
    }

    const { isMatch, duration } = matchFn(
      req,
      ctx,
      props as any,
    );

    return { isMatch, duration };
  }
};

const runFlagEffect = <D>(
  flag: Flag,
  req: Request,
  ctx: HandlerContext<D, LiveState>,
) => {
  const manifest = context.manifest as DecoManifest;
  const { data: { effect } } = flag;

  const effectFn: EffectFunction<any, any, any> | null = effect
    ? manifest.functions[effect.key].default as EffectFunction
    : null;

  return effectFn?.(req, ctx, effect?.props as any) ?? true;
};

const isCookieExpired = (cookie: CookiedFlag, flag: Flag) =>
  cookie.updated_at !== flag.updated_at;

export const loadFlags = async <Data = unknown>(
  req: Request,
  ctx: HandlerContext<Data, LiveState>,
) => {
  const site = context.siteId;

  // TODO: Cache flags stale for 5 minutes, refresh every 30s
  const response: { data: Array<Flag> | null; error: unknown } =
    await getSupabaseClient()
      .from("flags")
      .select(`id, name, key, state, data, updated_at, site`)
      .eq("site", site)
      .eq("state", "published");

  const availableFlags = response.data ?? [];

  if (response.error) {
    console.error("Error fetching flags:", response.error);
  }

  const activeFlags: Record<string, unknown> = {};

  const flagsToCookie: CookiedFlag[] = [];
  const cookiedFlags = cookies.getFlags(req.headers);

  // TODO: if queryString.flagIds, then activate those flags and skip matching
  for (const flag of availableFlags) {
    const cookied = cookiedFlags?.get(flag.key);

    // Flag coming from the cookie
    if (cookied && !isCookieExpired(cookied, flag)) {
      if (cookied.isMatch) {
        activeFlags[flag.key] = cookied.value;
      }

      continue;
    }

    // Flag not on cookie or cookie expired, let's run it
    const matched = runFlagMatchers(flag, req, ctx);

    if (matched) {
      if (matched.isMatch) {
        activeFlags[flag.key] = runFlagEffect(flag, req, ctx);
      }

      if (matched.duration === "session") {
        flagsToCookie.push({
          key: flag.key,
          isMatch: matched.isMatch,
          value: activeFlags[flag.key],
          updated_at: flag.updated_at,
        });
      }
    }
  }

  return { activeFlags, flagsToCookie };
};
