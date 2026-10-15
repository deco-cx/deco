// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "@std/assert";
import { vary } from "../utils/vary.ts";
import loaderBlock, { type LoaderModule } from "./loader.ts";

const buildState = () => {
  const state: any = {
    vary: vary(),
    response: { headers: new Headers() },
    bag: new WeakMap(),
    flags: [],
    release: { revision: () => Promise.resolve("test-revision") },
  };
  state.global = state;
  return state;
};

// Same shape the resolver hands a loader block, for the page or an invoke.
const httpCtx = (state: any, resolverId: string) =>
  ({
    context: { state },
    request: new Request("https://example.com/p"),
    resolveChain: [{ type: "resolvable", value: resolverId }],
    resolverId,
    revision: "test-revision",
    resolve: (() => {}) as any,
  }) as any;

const run = (mod: LoaderModule, state: any, resolverId: string) => {
  const adapted = loaderBlock.adapt!(mod as any, resolverId) as any[];
  return adapted.at(-1)({}, httpCtx(state, resolverId));
};

// The loader cache write is fire-and-forget by design.
const cacheWrite = { sanitizeOps: false, sanitizeResources: false };

const noStore: LoaderModule = { default: () => "inner" };

const outer = (
  cache: LoaderModule["cache"],
  state: any,
): LoaderModule => {
  const key = crypto.randomUUID(); // Cache API persists on disk: always miss
  return {
    default: () => run(noStore, state, "inner-no-store"),
    cache,
    cacheKey: () => key,
  };
};

Deno.test({
  name: "cacheable loader invoking a no-store loader keeps the page cacheable",
  ...cacheWrite,
  fn: async () => {
    const state = buildState();
    const result = await run(
      outer("stale-while-revalidate", state),
      state,
      "outer",
    );
    assertEquals(result, "inner");
    assertEquals(state.vary.shouldCache, true);
  },
});

Deno.test({
  name:
    "a sibling no-store loader vetoing mid-flight still vetoes page caching",
  ...cacheWrite,
  fn: async () => {
    const state = buildState();
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const key = crypto.randomUUID();
    const slowOuter: LoaderModule = {
      default: async () => {
        entered.resolve();
        await release.promise;
        return run(noStore, state, "inner-no-store");
      },
      cache: "stale-while-revalidate",
      cacheKey: () => key,
    };

    const outerRun = run(slowOuter, state, "outer");
    await entered.promise; // the outer handler is running in its scope
    await run(noStore, state, "sibling-no-store");
    release.resolve();
    await outerRun;

    assertEquals(state.vary.shouldCache, false);
  },
});

Deno.test("non-cacheable loader still propagates the inner veto", async () => {
  const state = buildState();
  await run(outer("no-store", state), state, "outer");
  assertEquals(state.vary.shouldCache, false);

  const state2 = buildState();
  await run(outer("no-cache", state2), state2, "outer");
  assertEquals(state2.vary.shouldCache, false);
});
