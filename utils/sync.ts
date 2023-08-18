import { isAwaitable, PromiseOrValue } from "../engine/core/utils.ts";

export interface SyncOnce<T> {
  do: (cb: () => PromiseOrValue<T>) => PromiseOrValue<T>;
}

/**
 * Run the function only once.
 * usage:
 *
 * const runOnce = once<T>()
 * runOnce.do(() => new Date()) // this will return always the first value used.
 */
export const once = <T>(): SyncOnce<T> => {
  let result: PromiseOrValue<T> | null = null;
  return {
    do: (cb: () => PromiseOrValue<T>) => {
      if (result !== null) {
        return result;
      }
      const resp = cb();
      if (isAwaitable(resp)) {
        return result ??= resp.catch((err) => {
          result = null;
          throw err;
        });
      }
      return result ??= resp;
    },
  };
};
