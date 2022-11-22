import { HandlerContext } from "$fresh/server.ts";
import { DecoManifest, Flag, LivePageData, LiveState } from "$live/types.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";
import { EffectFunction, MatchFunction } from "$live/std/types.ts";
import RandomMatch from "$live/functions/RandomMatch.ts";
import SiteMatch from "$live/functions/SiteMatch.ts";
import SelectPageEffect from "$live/functions/SelectPageEffect.ts";

let flags: Flag[];
export const flag = (id: string) => flags.find((flag) => flag.id === id);

export const loadFlags = async (
  req: Request,
  ctx: HandlerContext<LivePageData, LiveState>,
) => {
  const site = context.siteId;
  const manifest = context.manifest as DecoManifest;

  // TODO: Cache flags stale for 5 minutes, refresh every 30s
  const { data: availableFlags, error } = await getSupabaseClient()
    .from<Flag>("flags")
    .select(
      `id, name, key, state, data`,
    )
    .eq("site", site)
    .eq("state", "published");

  if (error) {
    console.log("Error fetching flags:", error);
  }

  // TODO: if queryString.flagIds, then activate those flags and skip matching
  const activeFlags: Flag[] = (availableFlags ?? [])?.filter((flag) => {
    const { data: { matches } } = flag;

    for (const match of matches) {
      const { key, props } = match;
      const matchFn = (key === "$live/functions/RandomMatch.ts")
        ? RandomMatch
        : (key === "$live/functions/SiteMatch.ts")
        ? SiteMatch
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

  activeFlags?.forEach((flag) => {
    const { data: { effect } } = flag;

    const effectFn = effect
      ? (effect.key === "$live/functions/SelectPageEffect.ts")
        ? SelectPageEffect
        : manifest.functions[effect.key].default as EffectFunction
      : null;

    flag.value = effectFn?.(req, ctx, effect?.props as any) ?? true;
  });

  // TODO: set cookie with flag ids

  return activeFlags ?? [];
};
