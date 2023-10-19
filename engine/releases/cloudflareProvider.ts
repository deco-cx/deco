import { Resolvable } from "../../engine/core/resolver.ts";
import { singleFlight } from "../../engine/core/utils.ts";
import { stringToHexSha256 } from "../../utils/encoding.ts";
import { OnChangeCallback, ReadOptions, Release } from "./provider.ts";

interface CurrResolvables {
  state: Record<string, Resolvable<any>>;
  archived: Record<string, Resolvable<any>>;
}

const sleepBetweenRetriesMS = 100;
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let currentRevision = "unknown";
export const newCloudflareProvider = (
  site: string,
  release: string,
): Release => {
  const onChangeCbs: OnChangeCallback[] = [];
  const notify = () => {
    onChangeCbs.forEach((cb) => cb());
  };

  const sf = singleFlight<CurrResolvables | undefined>();
  const getConfig = () =>
    sf.do(
      "flight",
      async () => {
        const response = await fetch(
          `https://configs.deco.cx/${site}/${release}.json`,
        );
        if (!response.ok) {
          return undefined;
        }
        return response.json();
      },
    );

  // the first load retry attempts
  let remainingRetries = 5;
  // the last error based on the retries
  let lastError: Error;

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
    try {
      const data = await getConfig();
      if (!data) {
        reject("could not get config from cloudflare");
        return;
      }
      resolve(data);
    } catch (error) {
      remainingRetries--;
      lastError = error;
      await sleep(sleepBetweenRetriesMS);
      await tryResolveFirstLoad(resolve, reject);
      return;
    }
  };

  let currResolvables: Promise<CurrResolvables> = new Promise<
    CurrResolvables
  >(tryResolveFirstLoad);

  let sFlight = false;
  const updateInternalState = async (force?: boolean) => {
    if (sFlight && !force) {
      return;
    }
    try {
      sFlight = true;
      const resolvables = await getConfig();
      if (!resolvables) {
        return;
      }
      currResolvables = Promise.resolve(
        resolvables,
      );
      const nextRevision = await stringToHexSha256(JSON.stringify(resolvables));
      if (currentRevision !== nextRevision) {
        currentRevision = nextRevision;
        notify();
      }
    } finally {
      sFlight = false;
    }
  };

  return {
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
    revision: () => Promise.resolve(currentRevision),
    state: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState(true);
      }
      const resolvables = await currResolvables;
      return resolvables.state;
    },
  };
};
