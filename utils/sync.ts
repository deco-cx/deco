import { isAwaitable, type PromiseOrValue } from "../engine/core/utils.ts";

export interface SyncOnce<T> {
  do: (cb: () => PromiseOrValue<T>) => PromiseOrValue<T>;
}
export class Mutex {
  locked: boolean;
  queue: Array<ReturnType<typeof Promise.withResolvers<void>>>;
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  acquire(): Promise<Disposable> {
    const disposable = {
      [Symbol.dispose]: () => {
        return this.release();
      },
    };
    if (!this.locked) {
      this.locked = true;
      return Promise.resolve(disposable);
    }
    const promise = Promise.withResolvers<void>();
    this.queue.push(promise);
    return promise.promise.then(() => {
      return disposable;
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next?.resolve();
    } else {
      this.locked = false;
    }
  }
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
