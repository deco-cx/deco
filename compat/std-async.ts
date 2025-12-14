/**
 * Shim for @std/async
 * Provides async utilities compatible with Deno's std/async
 */

/**
 * Creates a debounced function that delays invoking fn until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  wait: number,
): T & { clear: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const debounced = ((...args: Parameters<T>) => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      fn(...args);
    }, wait);
  }) as T & { clear: () => void };

  debounced.clear = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
  };

  return debounced;
}

/**
 * Creates a deferred promise.
 */
export interface Deferred<T> extends Promise<T> {
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
  readonly state: "pending" | "fulfilled" | "rejected";
}

export function deferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  let state: "pending" | "fulfilled" | "rejected" = "pending";

  const promise = new Promise<T>((res, rej) => {
    resolve = (value) => {
      if (state === "pending") {
        state = "fulfilled";
        res(value);
      }
    };
    reject = (reason) => {
      if (state === "pending") {
        state = "rejected";
        rej(reason);
      }
    };
  }) as Deferred<T>;

  Object.defineProperty(promise, "state", { get: () => state });
  promise.resolve = resolve;
  promise.reject = reject;

  return promise;
}

/**
 * Delays execution for the specified number of milliseconds.
 */
export function delay(ms: number, options?: { signal?: AbortSignal }): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);

    options?.signal?.addEventListener("abort", () => {
      clearTimeout(id);
      reject(new DOMException("Delay was aborted", "AbortError"));
    });
  });
}

/**
 * Retries a function until it succeeds or max retries reached.
 */
export interface RetryOptions {
  maxRetries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  multiplier?: number;
  jitter?: number;
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 5,
    minTimeout = 1000,
    maxTimeout = 60000,
    multiplier = 2,
    jitter = 1,
  } = options;

  let attempt = 0;
  let timeout = minTimeout;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= maxRetries) {
        throw error;
      }

      const jitterValue = Math.random() * jitter * timeout;
      await delay(Math.min(timeout + jitterValue, maxTimeout));
      timeout *= multiplier;
    }
  }
}

/**
 * Creates a deadline promise that rejects after the specified time.
 */
export function deadline<T>(
  promise: Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutPromise = delay(ms, { signal: controller.signal }).then(() => {
    throw new DOMException("Deadline exceeded", "DeadlineExceeded");
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    controller.abort();
  });
}

/**
 * Pools async operations with concurrency limit.
 */
export async function pooledMap<T, R>(
  poolLimit: number,
  items: Iterable<T>,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];

  for (const item of items) {
    const p = Promise.resolve().then(() => fn(item)).then((result) => {
      results.push(result);
    });

    executing.push(p);

    if (executing.length >= poolLimit) {
      await Promise.race(executing);
      // Remove completed promises
      const completed = executing.filter((p) =>
        // @ts-ignore - checking internal state
        p.then ? false : true
      );
      for (const c of completed) {
        const idx = executing.indexOf(c);
        if (idx !== -1) executing.splice(idx, 1);
      }
    }
  }

  await Promise.all(executing);
  return results;
}

/**
 * MuxAsyncIterator - multiplexes async iterators
 */
export class MuxAsyncIterator<T> implements AsyncIterable<T> {
  #iterators: Set<AsyncIterator<T>> = new Set();
  #signal: Deferred<void> = deferred();

  add(iterator: AsyncIterable<T> | AsyncIterator<T>): void {
    const iter = Symbol.asyncIterator in iterator
      ? (iterator as AsyncIterable<T>)[Symbol.asyncIterator]()
      : iterator as AsyncIterator<T>;
    this.#iterators.add(iter);
  }

  async *iterate(): AsyncGenerator<T> {
    while (this.#iterators.size > 0) {
      const promises = [...this.#iterators].map(async (iter) => {
        const result = await iter.next();
        return { iter, result };
      });

      const { iter, result } = await Promise.race(promises);

      if (result.done) {
        this.#iterators.delete(iter);
      } else {
        yield result.value;
      }
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return this.iterate();
  }
}

