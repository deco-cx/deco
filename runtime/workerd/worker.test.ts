import { assertEquals, assertRejects } from "@std/assert";
import { sharedBoot } from "./worker.ts";

const ctx = () => {
  const kept: Promise<unknown>[] = [];
  return { kept, waitUntil: (p: Promise<unknown>) => void kept.push(p) };
};

const deferred = <T>() => {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const CROSS_REQUEST = new Error(
  "This promise was created by a request that has since ended",
);

Deno.test("sharedBoot: one boot for concurrent requests, kept alive by its request", async () => {
  const app = sharedBoot<string>();
  const d = deferred<string>();
  let starts = 0;
  const start = () => (starts++, d.promise);
  const a = ctx(), b = ctx();
  const pa = app(a, start);
  const pb = app(b, start);
  d.resolve("handler");
  assertEquals(await Promise.all([pa, pb]), ["handler", "handler"]);
  assertEquals(starts, 1);
  assertEquals(a.kept.length, 1); // the starter keeps the boot alive
  assertEquals(b.kept.length, 0);
});

Deno.test("sharedBoot: a waiter boots again when another request's boot fails", async () => {
  const app = sharedBoot<string>();
  const first = deferred<string>();
  let starts = 0;
  const pa = app(ctx(), () => (starts++, first.promise));
  // b waits on a's boot; a's request is cancelled.
  const pb = app(ctx(), () => (starts++, Promise.resolve("rebooted")));
  first.reject(CROSS_REQUEST);
  await assertRejects(() => pa); // the starter's own failure is not retried
  assertEquals(await pb, "rebooted");
  assertEquals(starts, 2);
  // The new boot is shared from now on.
  assertEquals(
    await app(ctx(), () => Promise.reject(new Error("no"))),
    "rebooted",
  );
});

Deno.test("sharedBoot: a failed boot is not cached, and retries only once", async () => {
  const app = sharedBoot<string>();
  await assertRejects(() =>
    app(ctx(), () => Promise.reject(new Error("boom")))
  );
  assertEquals(await app(ctx(), () => Promise.resolve("ok")), "ok");

  const other = sharedBoot<string>();
  const first = deferred<string>();
  const pa = other(ctx(), () => first.promise);
  let starts = 0;
  const pb = other(ctx(), () => (starts++, Promise.reject(new Error("again"))));
  first.reject(CROSS_REQUEST);
  await assertRejects(() => pa);
  await assertRejects(() => pb, Error, "again");
  assertEquals(starts, 1);
});
