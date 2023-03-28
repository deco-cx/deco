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

const fetchConfigs = (site: string) => {
  return getSupabaseClient().from("configs").select("state").eq(
    "site",
    site,
  ).single();
};

const fetchArchivedConfigs = (site: string) => {
  return getSupabaseClient().from("configs").select("archived").eq(
    "site",
    site,
  ).single();
};

export const newSupabaseDeploy = (site: string): ConfigStore => {
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
    resolve(data.state);
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
        data.state,
      );
      singleFlight = false;
    }, refetchIntervalMSDeploy);
  });

  const localSupabase = newSupabaseLocal(site);
  return {
    archived: localSupabase.archived.bind(localSupabase), // archived does not need to be fetched in background
    state: () => currResolvables,
  };
};

export const newSupabaseLocal = (site: string): ConfigStore => {
  const sf = singleFlight<Record<string, Resolvable>>();
  return {
    archived: async () => {
      return await sf.do(
        "archived",
        async () =>
          await fetchArchivedConfigs(site).then(({ data, error }) => {
            if (data === null || error != null) {
              throw error;
            }
            return data.archived as Record<string, Resolvable>;
          }),
      );
    },
    state: async () => {
      return await sf.do(
        "state",
        async () =>
          await fetchConfigs(site).then(({ data, error }) => {
            if (data === null || error != null) {
              throw error;
            }
            return data.state as Record<string, Resolvable>;
          }),
      );
    },
  };
};

export const tryUseProvider = (
  providerFunc: (site: string) => ConfigStore,
  site: string,
): ConfigStore => {
  let provider: null | ConfigStore = null;
  const sf = singleFlight();
  const setProviderIfExists = async () => {
    await sf.do("any", async () => {
      if (provider === null) {
        const supabase = getSupabaseClient();
        const { error, count } = await supabase.from("configs").select("*", {
          count: "exact",
          head: true,
        }).eq("site", site);
        if (error !== null && count === 1) {
          provider = providerFunc(site);
        }
      }
    });
  };

  const callIfExists = (method: keyof ConfigStore) => async () => {
    if (provider !== null) { // first try without singleflight check faster path check
      return await provider[method]();
    }
    await setProviderIfExists();
    if (provider !== null) { // try again to avoid singleflight check.
      return await (provider as ConfigStore)[method]();
    }
    return {}; //empty
  };

  setProviderIfExists();
  return {
    archived: callIfExists("archived"),
    state: callIfExists("state"),
  };
};
