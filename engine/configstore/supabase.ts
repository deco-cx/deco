// deno-lint-ignore-file no-explicit-any
import { supabase } from "$live/deps.ts";
import { ConfigStore } from "$live/engine/configstore/provider.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { singleFlight } from "$live/engine/core/utils.ts";
import getSupabaseClient from "$live/supabase.ts";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const sleepBetweenRetriesMS = 100;
const refetchIntervalMSDeploy = 5_000;

const fetchConfigs = (site: number) => {
  return getSupabaseClient().from("configs").select("config").eq(
    "site",
    site,
  ).single();
};

export const newSupabaseDeploy = (site: number): ConfigStore => {
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
    const { data, error } = await fetchConfigs(site);
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

  currResolvables.then(() => {
    let singleFlight = false;
    setInterval(async () => {
      if (singleFlight) {
        return;
      }
      singleFlight = true;
      const { data, error } = await fetchConfigs(site);
      if (data === null || error !== null) {
        singleFlight = false;
        return;
      }
      currResolvables = Promise.resolve(
        data.config,
      );
      singleFlight = false;
    }, refetchIntervalMSDeploy);
  });

  return {
    get: () => currResolvables,
  };
};

export const newSupabaseLocal = (site: number): ConfigStore => {
  const sf = singleFlight<Record<string, Resolvable>>();
  return {
    get: async () => {
      return await sf.do(
        "any",
        async () =>
          await fetchConfigs(site).then(({ data, error }) => {
            if (data === null || error != null) {
              throw error;
            }
            return data.config as Record<string, Resolvable>;
          }),
      );
    },
  };
};
