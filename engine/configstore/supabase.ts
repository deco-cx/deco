// deno-lint-ignore-file no-explicit-any
import { supabase } from "$live/deps.ts";
import { ConfigStore } from "$live/engine/configstore/provider.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import getSupabaseClient from "$live/supabase.ts";
import { context } from "$live/live.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const sleepBetweenRetriesMS = 100;
const refetchIntervalMSDeploy = 5_000;
const refetchInternalMSLocal = 2_000;

export const newSupabase = (site: number): ConfigStore => {
  const fetchConfigs = () => {
    return getSupabaseClient().from("configs").select("config").eq(
      "site",
      site,
    ).single();
  };

  let remainingRetries = 5;
  let lastError: supabase.PostgrestSingleResponse<unknown>["error"] = null;

  const tryResolveFirstLoad = async (
    resolve: (
      value:
        | Record<string, Resolvable<any>>
        | PromiseLike<Record<string, Resolvable<any>>>,
    ) => void,
    reject: (reason: unknown) => void,
  ) => {
    if (remainingRetries === 0) {
      reject(lastError); // TODO @author Marcos V. Candeia should we panic? and exit? Deno.exit(1)
      return;
    }
    const { data, error } = await fetchConfigs();
    if (error != null || data === null) {
      remainingRetries--;
      lastError = error;
      await sleep(sleepBetweenRetriesMS);
      await tryResolveFirstLoad(resolve, reject);
      return;
    }
    resolve(data.config);
  };

  let currResolvables: Promise<Record<string, Resolvable<any>>> = new Promise<
    Record<string, Resolvable<any>>
  >(tryResolveFirstLoad);

  let currCb: null | (() => void) = null;

  currResolvables.then(() => {
    let singleFlight = false;
    setInterval(async () => {
      if (!currCb || singleFlight) {
        return;
      }
      singleFlight = true;
      const { data, error } = await fetchConfigs();
      if (data === null || error !== null) {
        singleFlight = false;
        return;
      }
      currResolvables = Promise.resolve(
        data.config,
      );
      currCb();
      singleFlight = false;
    }, context.isDeploy ? refetchIntervalMSDeploy : refetchInternalMSLocal);
  });

  return {
    get: () => currResolvables,
    onChange: (cb) => {
      currCb = cb;
    },
  };
};
