import { assertEquals, assertRejects } from "@std/assert";
import {
  pageCacheVersion,
  sharedBoot,
  SNAPSHOT_FILE,
  snapshotBuildId,
} from "./worker.ts";

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

Deno.test("sharedBoot: concurrent waiters share one replacement boot", async () => {
  const app = sharedBoot<string>();
  const first = deferred<string>();
  const second = deferred<string>();
  let starts = 0;
  const start = () => (++starts === 1 ? first.promise : second.promise);
  const a = ctx(), b = ctx(), c = ctx();
  const pa = app(a, start);
  // b and c wait on a's boot; a's request is cancelled.
  const pb = app(b, start);
  const pc = app(c, start);
  first.reject(CROSS_REQUEST);
  await assertRejects(() => pa);
  await new Promise((r) => setTimeout(r, 0)); // let b and c retry
  // One replacement boot, started (and kept alive) by one of the waiters only.
  assertEquals(starts, 2);
  assertEquals(b.kept.length + c.kept.length, 1);
  second.resolve("rebooted");
  assertEquals(await Promise.all([pb, pc]), ["rebooted", "rebooted"]);
  assertEquals(starts, 2);
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

Deno.test("pageCacheVersion: a rebuild of the same commit gets a new version", () => {
  const env = { BUILD_HASH: "f69f275" };
  const a = {
    [SNAPSHOT_FILE]: JSON.stringify({ build_id: "564a0f", files: {} }),
  };
  const b = {
    [SNAPSHOT_FILE]: JSON.stringify({ build_id: "a0a909", files: {} }),
  };
  assertEquals(pageCacheVersion(env, snapshotBuildId(a)), "f69f275:564a0f");
  assertEquals(pageCacheVersion(env, snapshotBuildId(b)), "f69f275:a0a909");
});

Deno.test("pageCacheVersion: falls back to the deploy id alone", () => {
  assertEquals(
    pageCacheVersion({ BUILD_HASH: "abc" }, snapshotBuildId({})),
    "abc",
  );
  assertEquals(
    pageCacheVersion(
      { DENO_DEPLOYMENT_ID: "dep" },
      snapshotBuildId({ [SNAPSHOT_FILE]: "not json" }),
    ),
    "dep",
  );
});

Deno.test("pageCacheVersion: no deploy id keeps the page cache off", () => {
  assertEquals(pageCacheVersion({}, undefined), "");
  // A snapshot alone doesn't enable it (servePage bypasses "no-version").
  assertEquals(pageCacheVersion({}, "564a0f"), "");
});
