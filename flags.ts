import { MiddlewareHandlerContext } from "$fresh/server.ts";
import { DecoManifest, Flag, LiveState } from "$live/types.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";
import { EffectFunction, MatchFunction } from "$live/std/types.ts";

let flags: Flag[];
export const flag = (id: string) => flags.find((flag) => flag.id === id);

export const loadFlags = async (
  req: Request,
  ctx: MiddlewareHandlerContext<LiveState>,
) => {
  const site = context.siteId;
  const manifest = context.manifest as DecoManifest;

  // TODO: Cache flags stale for 5 minutes, refresh every 30s
  const { data: availableFlags, error } = await getSupabaseClient()
    .from<Flag>("flags")
    .select(
      `id, name, state, site!inner(name, id), data`,
    )
    .eq("site", site)
    .eq("state", "published");

  if (error) {
    console.log("Error fetching flags:", error);
  }
  console.log("Available flags:", availableFlags);

  // TODO: if queryString.flagIds, then activate those flags and skip matching
  const activeFlags = availableFlags?.filter((flag) => {
    const { data: { matches } } = flag;

    for (const match of matches) {
      const { key, props } = match;
      const matchFn = manifest.functions[key].default as MatchFunction;
      // RandomMatch.ts
      // GradualRolloutMatch.ts
      // UserIdMatch.ts
      const { isMatch, duration } = matchFn(req, ctx, props);
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
    const { data: { effects } } = flag;

    effects.forEach((effect) => {
      const { key, props } = effect;
      const effectFn = manifest.functions[key].default as EffectFunction;
      effectFn(req, ctx, props);
    });
  });

  // TODO: set cookie with flag ids

  ctx.state.flags = activeFlags as Flag[];

  return activeFlags;
};
