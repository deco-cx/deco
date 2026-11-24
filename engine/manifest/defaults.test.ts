// deno-lint-ignore-file no-explicit-any
import { assertEquals, assertRejects } from "@std/assert";
import { HttpError } from "../errors.ts";
import type { Resolver, ResolverMap } from "../core/resolver.ts";
import defaults, {
  blockTypeOf,
  INVOKE_PREFIX_KEY,
  isInvocableBlockType,
} from "./defaults.ts";

const typed = (type: string): Resolver => {
  const resolver: Resolver = (props: any) => Promise.resolve(props);
  resolver.type = type;
  return resolver;
};

const resolvers: ResolverMap = {
  "site/loaders/products.ts": typed("loaders"),
  "site/actions/cart.ts": typed("actions"),
  [`${INVOKE_PREFIX_KEY}site/workflows/sync.ts`]: typed("workflows"),
  "site/sections/Widget.tsx": typed("sections"),
  "site/apps/hub.ts": typed("apps"),
  "website/matchers/always.ts": typed("matchers"),
  resolved: (props: any) => Promise.resolve(props),
};

const resolvables: Record<string, any> = {
  "Saved Products": { __resolveType: "site/loaders/products.ts" },
  "Saved Widget": {
    __resolveType: "site/sections/Widget.tsx",
    component: "/components/Cart.tsx",
  },
  "Alias of Saved Widget": { __resolveType: "Saved Widget" },
  "Loop A": { __resolveType: "Loop B" },
  "Loop B": { __resolveType: "Loop A" },
};

Deno.test("blockTypeOf", () => {
  assertEquals(
    blockTypeOf("site/loaders/products.ts", resolvers, resolvables),
    "loaders",
  );
  assertEquals(
    blockTypeOf("Alias of Saved Widget", resolvers, resolvables),
    "sections",
  );
  assertEquals(blockTypeOf("resolved", resolvers, resolvables), undefined);
  assertEquals(blockTypeOf("nothing", resolvers, resolvables), undefined);
  // Cannot tell: not invocable.
  assertEquals(
    isInvocableBlockType(blockTypeOf("Loop A", resolvers, resolvables)),
    false,
  );
});

Deno.test("invoke only calls loaders, actions, functions and workflows", async (t) => {
  const invoke = (block: string, props: unknown = {}) =>
    defaults.invoke(
      { block, props },
      {
        resolvers,
        resolvables,
        resolve: (value: any) => Promise.resolve(value),
        resolveChain: [],
      } as any,
    );

  for (
    const block of [
      "site/loaders/products.ts",
      "site/actions/cart.ts",
      "site/workflows/sync.ts",
      "Saved Products",
    ]
  ) {
    await t.step(`calls ${block}`, async () => {
      await invoke(block);
    });
  }

  for (
    const block of [
      "site/sections/Widget.tsx",
      "site/apps/hub.ts",
      "website/matchers/always.ts",
      "Saved Widget",
      "Alias of Saved Widget",
    ]
  ) {
    await t.step(`refuses ${block}`, async () => {
      const err = await assertRejects(
        () => invoke(block, { component: "/components/Other.tsx" }),
        HttpError,
      );
      assertEquals(err.status, 403);
    });
  }
});
