import {
  assert,
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "@std/assert";
import { createFetch } from "./fetchTimeout.ts";

/**
 * `RequestInit` resolves to a union here where only some members carry
 * `signal`, so reading it needs the same narrowing `utils/patched_fetch.ts`
 * uses.
 */
const signalOf = (init: unknown): AbortSignal | undefined =>
  init !== null && typeof init === "object" && "signal" in init
    ? (init as { signal?: AbortSignal }).signal
    : undefined;

/**
 * Stands in for a hanging upstream. It has to honour `signal` the way the real
 * `fetch` does — a stub that ignores it would hang the test rather than prove
 * the wrapper aborts anything.
 */
const never: typeof fetch = (_input, init) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = signalOf(init);
    if (!signal) return;
    if (signal.aborted) return reject(signal.reason);
    signal.addEventListener("abort", () => reject(signal.reason));
  });

const ok: typeof fetch = () => Promise.resolve(new Response("ok"));

Deno.test("disabled: returns the fetcher untouched", () => {
  // Identity, not equivalence: upgrading must not add a wrapper to the call
  // path of a site that never opted in.
  assertStrictEquals(createFetch(never, 0), never);
  assertStrictEquals(createFetch(never, -1), never);
  assertStrictEquals(createFetch(never, NaN), never);
});

Deno.test("enabled: aborts a hanging call with TimeoutError", async () => {
  const fetcher = createFetch(never, 20);

  const error = await assertRejects(() => fetcher("https://example.com"));

  assert(error instanceof DOMException, `not a DOMException: ${error}`);
  assertEquals(error.name, "TimeoutError");
});

Deno.test("enabled: a call that answers in time is untouched", async () => {
  const fetcher = createFetch(ok, 1_000);

  assertEquals(await (await fetcher("https://example.com")).text(), "ok");
});

Deno.test("enabled: the deadline still applies when a caller signal is present", async () => {
  const controller = new AbortController();
  const fetcher = createFetch(never, 20);

  const error = await assertRejects(() =>
    fetcher("https://example.com", { signal: controller.signal })
  );

  assertEquals((error as DOMException).name, "TimeoutError");
});

Deno.test("enabled: the caller's signal wins when it fires first", async () => {
  const controller = new AbortController();
  const reason = new Error("caller gave up");
  const fetcher = createFetch(never, 5_000);

  const pending = assertRejects(() =>
    fetcher("https://example.com", { signal: controller.signal })
  );
  controller.abort(reason);

  assertStrictEquals(await pending, reason);
});

Deno.test("enabled: an already-aborted caller signal rejects immediately", async () => {
  // The Lazy.tsx shape: a signal aborted before the call is ever made.
  const reason = new Error("dropped deferred section");
  const fetcher = createFetch(never, 5_000);

  const error = await assertRejects(() =>
    fetcher("https://example.com", { signal: AbortSignal.abort(reason) })
  );

  assertStrictEquals(error, reason);
});
