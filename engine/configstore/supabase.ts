// deno-lint-ignore-file no-explicit-any
import { supabase } from "$live/deps.ts";
import { ConfigStore, ReadOptions } from "$live/engine/configstore/provider.ts";
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

  let singleFlight = false;

  const updateInternalState = async () => {
    if (singleFlight) {
      return;
    }
    try {
      singleFlight = true;
      const { data, error } = await fetchConfigs(site);
      if (data === null || error !== null) {
        return;
      }
      currResolvables = Promise.resolve(
        data.state,
      );
    } finally {
      singleFlight = false;
    }
  };
  currResolvables.then(() => {
    setInterval(updateInternalState, refetchIntervalMSDeploy);
  });

  const localSupabase = newSupabaseLocal(site);
  return {
    archived: localSupabase.archived.bind(localSupabase), // archived does not need to be fetched in background
    state: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState();
      }
      return await currResolvables;
    },
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
        if (error === null && count === 1) {
          provider = providerFunc(site);
        }
      }
    });
  };

  const callIfExists = async (
    method: keyof ConfigStore,
    options?: ReadOptions,
  ) => {
    if (provider !== null) { // first try without singleflight check faster path check
      return await provider[method](options);
    }
    setProviderIfExists();
    return {}; //empty
  };

  let setIfExistsCall = setProviderIfExists();
  return {
    archived: (options?: ReadOptions) =>
      setIfExistsCall.then(() => callIfExists("archived", options)).catch(
        (_) => {
          setIfExistsCall = setProviderIfExists();
          return {};
        },
      ),
    state: (options?: ReadOptions) =>
      setIfExistsCall.then(() => callIfExists("state", options)).catch((_) => {
        setIfExistsCall = setProviderIfExists();
        return {};
      }),
  };
};
