// deno-lint-ignore-file no-explicit-any
import { supabase } from "../../deps.ts";
import { logger } from "../../observability/otel/config.ts";
import { randId as ulid } from "../../utils/rand.ts";
import { Resolvable } from "../core/resolver.ts";
import { OnChangeCallback, ReadOptions, Release } from "./provider.ts";

export interface RealtimeReleaseProvider {
  /**
   * @returns the current state of the release.
   */
  get(
    includeArchived: boolean,
  ): PromiseLike<{ data: CurrResolvables | null; error: any }>;
  unsubscribe?: () => void;
  /**
   * When called, receives the `onChange` function that will be called when the release has changed,
   * and the `cb` function that will be called when the subscription state change. The cb function can be used to determine if it should fallsback to background updates or not.
   * @param onChange
   * @param cb
   */
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
const refetchIntervalMSDeploy = 30_000;
const REFETCH_JITTER_MS = 2_000;

export interface CurrResolvables {
  state: Record<string, Resolvable<any>>;
  archived: Record<string, Resolvable<any>>;
  revision: string;
}

/**
 * Receives a provider backed by realtime subscription and creates a Releases instance.
 * @param provider the realtime provider.
 * @param backgroundUpdate if background updates should be performed.
 * @returns
 */
export const newRealtime = (
  provider: RealtimeReleaseProvider,
  backgroundUpdate?: boolean,
): Release => {
  // callbacks
  const onChangeCbs: OnChangeCallback[] = [];
  const notify = () => {
    return Promise.all(onChangeCbs.map((cb) => cb())).then(() => {});
  };
  // the first load retry attempts
  let remainingRetries = 5;
  // the last error based on the retries
  let lastError: supabase.PostgrestSingleResponse<unknown>["error"] = null;

  // the first load is required as the isolate should not depend on any background behavior to work properly.
  // so this method retries 5 times with a 100ms delay between each attempt otherwise the promise will be rejected.
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
    const { data, error } = await provider.get(false);
    if (error !== null || data === null) {
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

  // forces an update in to the internal state.
  const updateInternalState = async (force?: boolean) => {
    if (singleFlight && !force) {
      return;
    }
    try {
      singleFlight = true;
      const { data, error } = await provider.get(force === true); // if it is forced so we should include archived
      if (error !== null) {
        const errMsg = `update internal state error ${error}`;
        logger.error(errMsg);
        console.error(errMsg);
        return;
      }
      const resolvables = data ??
        { state: {}, archived: {}, revision: ulid() };

      const currentRevision = currResolvables.then((r) => r.revision).catch(
        () => "unknown",
      );
      currResolvables = Promise.resolve(
        resolvables,
      );
      const nextRevision = resolvables.revision;
      if (await currentRevision !== nextRevision) {
        notify();
      }
    } finally {
      singleFlight = false;
    }
  };

  if (backgroundUpdate) {
    // if background updates are enabled so the first attempt will try to connect with supabase realtime-updates.
    // if it fails for some reason it will fallback to background updates with a setInterval of 30s.
    const trySubscribeOrFetch = () => {
      provider.subscribe((newResolvables) => {
        console.debug(
          "realtime update received",
          Object.keys(newResolvables ?? {}),
        );
        currResolvables = Promise.resolve(newResolvables);
        notify();
      }, (_status, err) => {
        if (err) {
          const errMsg =
            `error when trying to subscribe to release changes falling back to background updates, ${err}`;
          logger.error(errMsg);
          console.error(errMsg);

          updateInternalState().finally(() => {
            const jitter = Math.floor(REFETCH_JITTER_MS * Math.random());
            sleep(refetchIntervalMSDeploy + jitter).then(() => {
              trySubscribeOrFetch();
            });
          });
        }
      });
    };
    currResolvables.then(trySubscribeOrFetch);
  }
  return {
    /**
     * @returns Return the archived pages.
     */
    archived: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState(true);
      }
      const resolvables = await currResolvables;
      return resolvables.archived;
    },
    onChange: (cb: OnChangeCallback) => {
      onChangeCbs.push(cb);
    },
    notify() {
      return notify();
    },
    revision: () =>
      currResolvables.then((r) => r.revision).catch(() => "unknown"),
    /**
     * @returns The current state of the release.
     */
    state: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState(true);
      }
      const resolvables = await currResolvables;
      return resolvables.state;
    },
    dispose: () => {
      provider?.unsubscribe?.();
    },
  };
};
