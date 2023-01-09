import { HandlerContext } from "$fresh/server.ts";
import { DecoManifest, Flag, LiveState } from "$live/types.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";
import { EffectFunction, MatchFunction } from "$live/std/types.ts";
import MatchRandom from "$live/functions/MatchRandom.ts";
import MatchSite from "$live/functions/MatchSite.ts";
import EffectSelectPage from "$live/functions/EffectSelectPage.ts";

let flags: Flag[];
export const flag = (id: string) => flags.find((flag) => flag.id === id);

export const loadFlags = async <Data = unknown>(
  req: Request,
  ctx: HandlerContext<Data, LiveState>,
) => {
  const site = context.siteId;
  const manifest = context.manifest as DecoManifest;

  // TODO: Cache flags stale for 5 minutes, refresh every 30s
  const { data: availableFlags, error } = await getSupabaseClient()
    .from("flags")
    .select(
      `id, name, key, state, data`,
    )
    .eq("site", site)
    .eq("state", "published");

  if (error) {
    console.log("Error fetching flags:", error);
  }

  // TODO: if queryString.flagIds, then activate those flags and skip matching
  const activeFlags = (availableFlags ?? [])?.filter((flag) => {
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
      if (duration === "session") {
        // TODO: Store in session
      }
      if (isMatch) {
        return true;
      }
    }

    return false;
  });

  (activeFlags as Flag[])?.forEach((flag) => {
    const { data: { effect } } = flag;

    const effectFn: EffectFunction<any, any, any> | null = effect
      ? (effect.key === "$live/functions/EffectSelectPage.ts")
        ? EffectSelectPage
        : manifest.functions[effect.key].default as EffectFunction
      : null;

    flag.value = effectFn?.(req, ctx, effect?.props as any) ?? true;
  });

  ctx.state.flags = (activeFlags as Flag[])?.reduce((acc, flag) => {
    acc[flag.key] = flag.value;
    return acc;
  }, {} as Record<string, unknown>);

  // TODO: set cookie with flag ids
  return (activeFlags as Flag[]) ?? [];
};
