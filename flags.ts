import { HandlerContext } from "$fresh/server.ts";
import { DecoManifest, Flag, LiveState } from "$live/types.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";
import { EffectFunction, MatchFunction } from "$live/std/types.ts";
import MatchRandom from "$live/functions/MatchRandom.ts";
import MatchSite from "$live/functions/MatchSite.ts";
import EffectSelectPage from "$live/functions/EffectSelectPage.ts";

const DECO_COOKIE = "deco_flag_";

export const cookies = {
  parse: (rawCookies: string | null) => {
    const flags: CookiedFlag[] | undefined = rawCookies
      ?.split("; ")
      .map((c) => c.split("="))
      .filter((cookie) => cookie[0].startsWith(DECO_COOKIE))
      .map((cookie) => JSON.parse(atob(cookie[1])));

    if (!flags) {
      return null;
    }

    const flagSet = new Map<string, CookiedFlag>();
    for (const flag of flags) {
      flagSet.set(flag.key, flag);
    }

    return flagSet;
  },
  format: (flags: CookiedFlag[]) => {
    return flags.reduce(
      (acc, flag) =>
        `${DECO_COOKIE}${flag.key}=${btoa(JSON.stringify(flag))}; ${acc}`,
      "",
    );
  },
};

interface CookiedFlag {
  key: string;
  isMatch: boolean;
  value: any;
  timestamp: string;
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

    const matchFn: MatchFunction<any, any, any> =
      (key === "$live/functions/MatchRandom.ts")
        ? MatchRandom
        : (key === "$live/functions/MatchSite.ts")
        ? MatchSite
        : manifest.functions[key]?.default as MatchFunction;
    // RandomMatch.ts
    // GradualRolloutMatch.ts
    // UserIdMatch.ts

    if (!matchFn) {
      throw new Error("No match function found for key: " + key);
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
    ? (effect.key === "$live/functions/EffectSelectPage.ts")
      ? EffectSelectPage
      : manifest.functions[effect.key].default as EffectFunction
    : null;

  return effectFn?.(req, ctx, effect?.props as any) ?? true;
};

const isCookieExpired = (cookie: CookiedFlag, flag: Flag) => {
  const { timestamp } = cookie;
  const { updated_at } = flag;

  return timestamp !== updated_at;
};

export const loadFlags = async <Data = unknown>(
  req: Request,
  ctx: HandlerContext<Data, LiveState>,
) => {
  const site = context.siteId;

  // TODO: Cache flags stale for 5 minutes, refresh every 30s
  const response: { data: Flag[]; error: unknown } = await getSupabaseClient()
    .from("flags")
    .select(`id, name, key, state, data, updated_at`)
    .eq("site", site)
    .eq("state", "published");

  const availableFlags = response.data ?? [];

  if (response.error) {
    console.log("Error fetching flags:", response.error);
  }

  const activeFlags: Record<string, unknown> = {};

  const flagsToCookie: CookiedFlag[] = [];
  const cookiedFlags = cookies.parse(req.headers.get("cookie"));

  // TODO: if queryString.flagIds, then activate those flags and skip matching
  for (const flag of availableFlags) {
    const cookied = cookiedFlags?.get(flag.key);

    // Flag coming from the cookie
    if (cookied && !isCookieExpired(cookied, flag)) {
      if (cookied.isMatch) {
        activeFlags[flag.key] = cookied.value;
      }

      flagsToCookie.push(cookied);

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
          timestamp: flag.updated_at,
        });
      }
    }
  }

  return { activeFlags, flagsToCookie };
};
