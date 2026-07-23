import { assertEquals, assertRejects } from "@std/assert";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { genHints } from "../../engine/core/hints.ts";
import {
  type BaseContext,
  resolve,
  type ResolverMap,
} from "../../engine/core/resolver.ts";
import defaults from "../manifest/fresh.ts";

Deno.test("resolve", async (t) => {
  const context: BaseContext = {
    revision: "",
    resolveChain: [],
    resolveId: "1",
    resolverId: "unknown",
    resolvables: {},
    resolvers: {},
    resolveHints: {},
    memo: {},
    runOnce: (_key, f) => f(),
    resolve: <T>(data: unknown) => {
      return data as T;
    },
  };
  await t.step(
    "dangling reference should be thrown when resolver is missing",
    async () => {
      await assertRejects(
        () =>
          resolve(
            {
              __resolveType: "not_found_resolver",
            },
            context,
          ),
        "Dangling reference of: not_found_resolver",
      );
    },
  );
  await t.step(
    "resolve should not change the original data",
    async () => {
      const identityResolver = (parent: unknown): unknown => {
        return Promise.resolve(parent);
      };
      const resolverMap = {
        ...defaults,
        resolve: (data: unknown) => context.resolve(data),
        identityResolver,
      };
      const resolvableMap = {
        shouldNotBeChanged: {
          bar: 10,
          foo: {
            barNested: {
              fooNested: 10,
            },
            __resolveType: identityResolver.name,
          },
          __resolveType: identityResolver.name,
        },
      };
      const clone = structuredClone(resolvableMap);
      const resolvable = {
        __resolveType: "shouldNotBeChanged",
      };
      const result = await resolve<typeof resolvable>(
        resolvable,
        {
          ...context,
          resolvers: resolverMap as unknown as ResolverMap,
          resolvables: resolvableMap,
        },
      );
      assertEquals(clone, resolvableMap);
      assertEquals({
        bar: 10,
        foo: {
          barNested: {
            fooNested: 10,
          },
        },
      } as unknown, result);
    },
  );
  await t.step(
    "resolved data should not be nested resolved",
    async () => {
      const shouldNotBeCalledResolver = (parent: unknown): unknown => {
        return Promise.resolve(parent);
      };
      const resolverMap = {
        ...defaults,
        resolve: (data: unknown) => context.resolve(data),
        shouldNotBeCalledResolver: spy(shouldNotBeCalledResolver),
      };
      const nestedResolvable = {
        props: {
          bar: 10,
        },
        __resolveType: shouldNotBeCalledResolver.name,
      };
      const result = await resolve<typeof nestedResolvable>(
        {
          data: nestedResolvable,
          __resolveType: "resolved",
        },
        { ...context, resolvers: resolverMap as unknown as ResolverMap },
      );
      assertEquals(result, nestedResolvable);
      assertSpyCalls(resolverMap.shouldNotBeCalledResolver, 0);
    },
  );

  await t.step("resolving a nested array", async () => {
    type TestType = {
      foo: string;
      bar: number;
    };
    const resolverMap = {
      resolve: (data: unknown) => context.resolve(data),
      testResolver: (parent: TestType): TestType => {
        return {
          ...parent,
          bar: parent.bar + 1,
        };
      },
    };
    const result = await resolve<{ values: TestType[] }>(
      {
        values: [
          {
            foo: "hello",
            bar: 1,
            __resolveType: "testResolver",
          },
          {
            foo: "hello",
            bar: 1,
            __resolveType: "testResolver",
          },
        ],
        __resolveType: "resolve",
      },
      { ...context, resolvers: resolverMap },
    );
    assertEquals(result, {
      values: [
        { foo: "hello", bar: 2 },
        { foo: "hello", bar: 2 },
      ],
    });
  });

  await t.step(
    "drops hidden array items (resolver -> undefined) but keeps null",
    async () => {
      // A hidden array item is a multivariate flag gated by a `never` matcher;
      // flag.ts returns `undefined` when no variant matched. Such items must be
      // dropped from the array, not left as holes (which serialize to `null`
      // and render as empty cards). A resolver returning `null` is a legitimate
      // value and is kept.
      const resolverMap = {
        resolve: (data: unknown) => context.resolve(data),
        hiddenFlag: (): unknown => undefined,
        nullFlag: (): unknown => null,
        keep: (p: { label: string }) => p,
      };
      const result = await resolve<{ items: unknown[] }>(
        {
          items: [
            { label: "A", __resolveType: "keep" },
            { __resolveType: "hiddenFlag" },
            { label: "B", __resolveType: "keep" },
            { __resolveType: "nullFlag" },
            { __resolveType: "hiddenFlag" },
          ],
          __resolveType: "resolve",
        },
        { ...context, resolvers: resolverMap as unknown as ResolverMap },
      );
      assertEquals(result, {
        items: [{ label: "A" }, { label: "B" }, null],
      });
    },
  );

  await t.step(
    "an array where every item is hidden becomes empty (not a hole array)",
    async () => {
      const resolverMap = {
        resolve: (data: unknown) => context.resolve(data),
        hiddenFlag: (): unknown => undefined,
      };
      const result = await resolve<{ items: unknown[] }>(
        {
          items: [
            { __resolveType: "hiddenFlag" },
            { __resolveType: "hiddenFlag" },
          ],
          __resolveType: "resolve",
        },
        { ...context, resolvers: resolverMap as unknown as ResolverMap },
      );
      assertEquals(result, { items: [] });
    },
  );

  await t.step(
    "hidden items are dropped at every array depth (nested arrays)",
    async () => {
      // The fix relies on the filter firing at each array level via recursion,
      // and on ordering being preserved when the first element is dropped.
      const resolverMap = {
        resolve: (data: unknown) => context.resolve(data),
        hiddenFlag: (): unknown => undefined,
        keep: (p: { label: string }) => p,
      };
      const result = await resolve<{ groups: unknown[][] }>(
        {
          groups: [
            [
              { __resolveType: "hiddenFlag" },
              { label: "A", __resolveType: "keep" },
            ],
            [{ __resolveType: "hiddenFlag" }],
          ],
          __resolveType: "resolve",
        },
        { ...context, resolvers: resolverMap as unknown as ResolverMap },
      );
      assertEquals(result, { groups: [[{ label: "A" }], []] });
    },
  );

  await t.step("resolves object with no resolvable fields", async () => {
    type TestType = {
      foo: string;
      bar: number;
    };
    const resolverMap = {
      testResolver: (parent: TestType): TestType => {
        return {
          ...parent,
          bar: parent.bar + 1,
        };
      },
    };
    const result = await resolve<TestType>(
      {
        foo: "hello",
        bar: 1,
        __resolveType: "testResolver",
      },
      { ...context, resolvers: resolverMap },
    );
    assertEquals(result, { foo: "hello", bar: 2 });
  });

  await t.step("resolve referencing a resolvable", async () => {
    type TestType = {
      foo: string;
      bar: {
        value: number;
      };
    };
    type TestTypeParent = {
      foo: string;
      bar: number;
    };
    const resolverMap = {
      testResolver2: (parent: TestType): TestType => {
        return parent;
      },
      testResolver: (parent: TestTypeParent): TestType => {
        return {
          ...parent,
          bar: {
            value: parent.bar,
          },
        };
      },
    };
    const resolvableMap = {
      key: {
        foo: "hello",
        bar: 10,
        __resolveType: "testResolver",
      },
    };

    const result = await resolve<
      TestType,
      BaseContext
    >(
      {
        __resolveType: "key",
      },
      {
        ...context,
        resolvers: resolverMap,
        resolvables: resolvableMap,
        resolveHints: genHints(resolvableMap),
      },
    );
    assertEquals(result, { foo: "hello", bar: { value: 10 } });
  });

  await t.step("resolve object with nested resolvable properties", async () => {
    type TestType = {
      foo: string;
      bar: {
        value: number;
      };
    };
    type TestTypeParent = {
      foo: string;
      bar: number;
    };
    const resolverMap = {
      testResolver: (parent: TestTypeParent): TestType => {
        return {
          ...parent,
          bar: {
            value: parent.bar,
          },
        };
      },
    };
    const result = await resolve<
      TestType,
      BaseContext
    >(
      {
        foo: "hello",
        bar: 10,
        __resolveType: "testResolver",
      },
      { ...context, resolvers: resolverMap },
    );
    assertEquals(result, { foo: "hello", bar: { value: 10 } });
  });
});
