// deno-lint-ignore-file no-explicit-any
import { AsyncLocalStorage } from "node:async_hooks";

/** The part of Cloudflare's `ExecutionContext` deco needs. */
export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}

// One store per isolate, shared through globalThis: the Worker entry
// (`createWorker`) and the site bundle (`freshForWorkerd`) each embed a copy of
// this module. With a store per copy, the app copy (evaluated last, at boot)
// replaced the request-scope hook below with a store that never holds the
// request, so the request scope and `waitUntil` were lost inside the app.
const STORAGE = Symbol.for("deco.workerd.executionContext");
const storage =
  ((globalThis as unknown as Record<symbol, unknown>)[STORAGE] ??=
    new AsyncLocalStorage<ExecutionContextLike>()) as AsyncLocalStorage<
      ExecutionContextLike
    >;

// The request a promise belongs to (`REQUEST_SCOPE` in engine/core/utils.ts):
// deco's singleFlight then only joins calls made by the same request. On
// workerd a promise created by a request that has ended can never settle, so a
// request waiting on another request's loader call failed with "This promise
// was created by a request that has since ended". The key is copied, not
// imported: this module is evaluated before deco boots.
(globalThis as unknown as Record<symbol, unknown>)[
  Symbol.for("deco.requestScope")
] = () => storage.getStore();

/** Runs `fn` with `ctx` as the current execution context. */
export const runWithExecutionContext = <T>(
  ctx: ExecutionContextLike,
  fn: () => T,
): T => storage.run(ctx, fn);

/**
 * Keeps the request alive until `promise` settles. On workerd, work that is
 * still pending when the response is sent is cancelled; outside a request
 * (or on Deno) this is a no-op.
 */
export const waitUntil = <T>(promise: Promise<T>): Promise<T> => {
  storage.getStore()?.waitUntil(promise.catch(() => {}));
  return promise;
};

const WRAPPED = Symbol.for("deco.workerd.caches");

/**
 * deco writes loader results to the Cache API without awaiting
 * (`cache.put(...)` then returns the data). On workerd the write is cut off
 * when the response finishes, which leaves truncated entries behind. This
 * makes every `put`/`delete` on caches opened from `globalThis.caches` part of
 * the current request's `waitUntil`.
 */
export function keepCacheWritesAlive(): void {
  const caches = (globalThis as any).caches as CacheStorage | undefined;
  if (!caches || (caches as any)[WRAPPED]) return;
  const open = caches.open.bind(caches);
  const wrap = (cache: Cache): Cache =>
    new Proxy(cache, {
      get(target, prop) {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;
        if (prop === "put" || prop === "delete") {
          return (...args: unknown[]) =>
            waitUntil(value.apply(target, args) as Promise<unknown>);
        }
        return value.bind(target);
      },
    });
  caches.open = (name: string) => open(name).then(wrap);
  (caches as any)[WRAPPED] = true;
}
