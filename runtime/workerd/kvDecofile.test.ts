import { assertEquals } from "@std/assert";
import type { DecofileProvider } from "../../engine/decofile/provider.ts";
import { runWithExecutionContext } from "./context.ts";
import {
  kvDecofileProvider,
  normalizePath,
  POLL_INTERVAL_MS,
  REDIRECT_TTL_MS,
} from "./kvDecofile.ts";
import { fastDeployFromEnv } from "./worker.ts";

const ID = "abc123";

/** An in-memory KV that counts reads. */
function memoryKV(entries: Record<string, string> = {}) {
  const data = new Map(Object.entries(entries));
  const reads: string[] = [];
  return {
    data,
    reads,
    get: (key: string) => {
      reads.push(key);
      return Promise.resolve(data.get(key) ?? null);
    },
  };
}

const embedded: DecofileProvider = {
  state: () => Promise.resolve({ home: { from: "embedded" } }),
  revision: () => Promise.resolve("embedded-rev"),
  onChange: () => ({ [Symbol.dispose]: () => {} }),
};

/** Runs `fn` as a request and waits for everything it handed to waitUntil. */
async function request<T>(fn: () => Promise<T>): Promise<T> {
  const pending: Promise<unknown>[] = [];
  const result = await runWithExecutionContext(
    { waitUntil: (p) => pending.push(p) },
    fn,
  );
  await Promise.all(pending);
  return result;
}

Deno.test("serves the decofile from KV and swaps it on a new revision", async () => {
  const kv = memoryKV({
    [`decofile:${ID}`]: JSON.stringify({ home: { v: 1 } }),
    [`index:revision:${ID}`]: "r1",
  });
  let t = 0;
  const provider = kvDecofileProvider({
    kv,
    deploymentId: ID,
    fallback: embedded,
    now: () => t,
  });
  let changes = 0;
  provider.onChange(() => {
    changes++;
  });

  assertEquals(await request(() => provider.state()), { home: { v: 1 } });
  assertEquals(await request(() => provider.revision()), "kv:r1");
  assertEquals(provider.kvRevision(), "r1");

  kv.data.set(`decofile:${ID}`, JSON.stringify({ home: { v: 2 } }));
  kv.data.set(`index:revision:${ID}`, "r2");
  // Within the poll interval: still the old decofile.
  t = POLL_INTERVAL_MS - 1;
  assertEquals(await request(() => provider.state()), { home: { v: 1 } });
  // After it: this request starts the poll, the next one sees the swap.
  t = POLL_INTERVAL_MS * 2;
  await request(() => provider.state());
  assertEquals(await request(() => provider.state()), { home: { v: 2 } });
  assertEquals(changes, 1);
});

Deno.test("falls back to the embedded decofile when KV has none", async () => {
  const provider = kvDecofileProvider({
    kv: memoryKV(),
    deploymentId: ID,
    fallback: embedded,
  });
  assertEquals(await request(() => provider.state()), {
    home: { from: "embedded" },
  });
  assertEquals(await request(() => provider.revision()), "embedded-rev");
  assertEquals(provider.kvRevision(), undefined);
});

Deno.test("falls back to the embedded decofile when KV fails", async () => {
  const provider = kvDecofileProvider({
    kv: { get: () => Promise.reject(new Error("KV down")) },
    deploymentId: ID,
    fallback: embedded,
  });
  assertEquals(await request(() => provider.state()), {
    home: { from: "embedded" },
  });
});

Deno.test("exact redirects: matched by source as written, cached for the TTL", async () => {
  const kv = memoryKV({
    [`redirect:${ID}:/old`]: JSON.stringify([
      { from: "/Old", to: "/upper", status: 307 },
      { from: "/old", to: "/new", status: 301, discardQueryParameters: true },
    ]),
  });
  let t = 0;
  const provider = kvDecofileProvider({
    kv,
    deploymentId: ID,
    fallback: embedded,
    now: () => t,
  });

  assertEquals(await provider.exactRedirect!("/old"), {
    to: "/new",
    type: "permanent",
    discardQueryParameters: true,
  });
  assertEquals(await provider.exactRedirect!("/Old"), {
    to: "/upper",
    type: "temporary",
  });
  // Same key, no rule written for this exact source: Fresh would not match.
  assertEquals(await provider.exactRedirect!("/OLD"), null);
  assertEquals(await provider.exactRedirect!("/missing"), null);

  const reads = kv.reads.length;
  await provider.exactRedirect!("/missing");
  assertEquals(kv.reads.length, reads, "a miss is cached too");
  t = REDIRECT_TTL_MS + 1;
  await provider.exactRedirect!("/missing");
  assertEquals(kv.reads.length, reads + 1);
});

Deno.test("exact redirects: a KV failure is no redirect", async () => {
  const provider = kvDecofileProvider({
    kv: { get: () => Promise.reject(new Error("KV down")) },
    deploymentId: ID,
    fallback: embedded,
  });
  assertEquals(await provider.exactRedirect!("/old"), null);
});

Deno.test("normalizePath matches @decocms/blocks' KV key", () => {
  assertEquals(normalizePath("/Foo/Bar/"), "/foo/bar");
  assertEquals(normalizePath("foo"), "/foo");
  assertEquals(normalizePath("https://site.com/A/"), "/a");
  assertEquals(normalizePath("/"), "/");
});

Deno.test("fastDeployFromEnv needs the flag, a KV binding and an id", () => {
  const kv = memoryKV();
  assertEquals(fastDeployFromEnv({ DECO_KV: kv, BUILD_HASH: ID }), null);
  assertEquals(
    fastDeployFromEnv({ DECO_FAST_DEPLOY: "1", DECO_KV: "x", BUILD_HASH: ID }),
    null,
  );
  assertEquals(fastDeployFromEnv({ DECO_FAST_DEPLOY: "1", DECO_KV: kv }), null);
  assertEquals(
    fastDeployFromEnv({
      DECO_FAST_DEPLOY: "true",
      DECO_KV: kv,
      BUILD_HASH: ID,
    }),
    { kv, deploymentId: ID },
  );
});
