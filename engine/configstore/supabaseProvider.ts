// deno-lint-ignore-file no-explicit-any
import { supabase } from "$live/deps.ts";
import { ConfigStore, ReadOptions } from "$live/engine/configstore/provider.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";

export interface SupabaseConfigProvider {
  get(): PromiseLike<{ data: CurrResolvables | null; error: any }>;
  subscribe(
    onChange: (arg: CurrResolvables) => void,
    cb: (
      status: `${supabase.REALTIME_SUBSCRIBE_STATES}`,
      err?: Error,
    ) => void,
  ): void;
}
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
const sleepBetweenRetriesMS = 100;
const refetchIntervalMSDeploy = 5_000;

export interface CurrResolvables {
  state: Record<string, Resolvable<any>>;
  archived: Record<string, Resolvable<any>>;
}

export const newSupabase = (
  provider: SupabaseConfigProvider,
  backgroundUpdate?: boolean,
): ConfigStore => {
  let remainingRetries = 5;
  let lastError: supabase.PostgrestSingleResponse<unknown>["error"] = null;

  const tryResolveFirstLoad = async (
    resolve: (
      value:
        | CurrResolvables
        | PromiseLike<CurrResolvables>,
    ) => void,
    reject: (reason: unknown) => void,
  ) => {
    if (remainingRetries === 0) {
      reject(lastError); // TODO @author Marcos V. Candeia should we panic? and exit? Deno.exit(1)
      return;
    }
    const { data, error } = await provider.get();
    if (error != null || data === null) {
      remainingRetries--;
      lastError = error;
      await sleep(sleepBetweenRetriesMS);
      await tryResolveFirstLoad(resolve, reject);
      return;
    }
    resolve(data);
  };

  let currResolvables: Promise<CurrResolvables> = new Promise<
    CurrResolvables
  >(tryResolveFirstLoad);

  let singleFlight = false;

  const updateInternalState = async (force?: boolean) => {
    if (singleFlight && !force) {
      return;
    }
    try {
      singleFlight = true;
      const { data, error } = await provider.get();
      if (error !== null) {
        return;
      }
      currResolvables = Promise.resolve(
        data ?? { state: {}, archived: {} },
      );
    } finally {
      singleFlight = false;
    }
  };

  if (backgroundUpdate) {
    currResolvables.then(() => {
      provider.subscribe((newResolvables) => {
        currResolvables = Promise.resolve(newResolvables);
      }, (_status, err) => {
        if (err) {
          console.error(
            "error when trying to subscribe to config changes falling back to background updates",
          );
          setInterval(updateInternalState, refetchIntervalMSDeploy);
        }
      });
    });
  }
  return {
    archived: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState(true);
      }
      const resolvables = await currResolvables;
      return resolvables.archived;
    }, // archived does not need to be fetched in background
    state: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState(true);
      }
      const resolvables = await currResolvables;
      return resolvables.state;
    },
  };
};
