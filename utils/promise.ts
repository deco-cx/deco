/**
 * Promise.prototype.then onfufilled callback type.
 */
export type Fulfilled<R, T> = ((result: R) => T | PromiseLike<T>) | null;

/**
 * Promise.then onrejected callback type.
 */
// deno-lint-ignore no-explicit-any
export type Rejected<E> = ((reason: any) => E | PromiseLike<E>) | null;

export interface Deferred<T> extends Promise<T> {
  readonly state: "pending" | "fulfilled" | "rejected";
  resolve(value?: T | PromiseLike<T>): void;
  // deno-lint-ignore no-explicit-any
  reject(reason?: any): void;
}

/**
 * Creates a Promise with the `reject` and `resolve` functions placed as methods
 * on the promise object itself.
 *
 * @example
 * ```typescript
 * import { deferred } from "https://deno.land/std@$STD_VERSION/async/deferred.ts";
 *
 * const p = deferred<number>();
 * // ...
 * p.resolve(42);
 * ```
 */
export function deferred<T>(): Deferred<T> {
  const { resolve, reject, promise } = Promise.withResolvers<T>();
  let state = "pending";
  Object.defineProperty(promise, "state", { get: () => state });
  return Object.assign(promise, {
    resolve: (v: T | PromiseLike<T>) => {
      resolve(v);
      state = "fulfilled";
    },
    // deno-lint-ignore no-explicit-any
    reject: (reason: any) => {
      reject(reason);
      state = "rejected";
    },
  }) as Deferred<T>;
}
