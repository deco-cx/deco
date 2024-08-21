import { Mutex } from "@core/asyncutil/mutex";
import type { MiddlewareHandler } from "@hono/hono";

export const createReadWriteLock = () => {
  const read = new Mutex();
  const write = new Mutex();

  const wlock = async () => {
    const [w, r] = await Promise.all([
      write.acquire(),
      read.acquire(),
    ]);

    return {
      [Symbol.dispose]: () => {
        w[Symbol.dispose]();
        r[Symbol.dispose]();
      },
    };
  };

  const rlock = async () => {
    const w = write.locked
      ? await write.acquire()
      : { [Symbol.dispose]: () => {} };

    const r = read.acquire();

    return {
      [Symbol.dispose]: () => {
        w[Symbol.dispose]();
        r.then((r) => r[Symbol.dispose]());
      },
    };
  };

  return { wlock, rlock };
};

export type RwLock = ReturnType<typeof createReadWriteLock>;

export const createLocker = () => {
  const lock = createReadWriteLock();

  const wlock: MiddlewareHandler = async (_c, next) => {
    using _ = await lock.wlock();
    await next();
  };

  const rlock: MiddlewareHandler = async (_c, next) => {
    using _ = await lock.rlock();
    await next();
  };

  return { wlock, rlock, lock };
};
