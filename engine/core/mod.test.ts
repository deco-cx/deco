import {
  BaseContext,
  Resolvable,
  resolve,
} from "$live/engine/core/resolver.ts";
import {
  assertSpyCall,
  assertSpyCallArg,
  assertSpyCalls,
  spy,
} from "https://deno.land/std@0.179.0/testing/mock.ts";
import { assertEquals, assertRejects } from "std/testing/asserts.ts";

Deno.test("resolve", async (t) => {
  const context: BaseContext = {
    resolveChain: [],
    resolveId: "1",
    resolvables: {},
    resolvers: {},
    resolve: (data) => {
      return data;
    },
  };
  // FIXME we do not support chaining resolvers for now

  // await t.step(
  //   "resolveType as function should be called when specified",
  //   async () => {
  //     type InputType = {
  //       bar: number;
  //     };
  //     type OutputType = {
  //       barString: string;
  //     };

  //     const toStringBarResolver = (d: InputType): OutputType => {
  //       return { barString: d.bar.toString() };
  //     };
  //     const addToStringBarResolver = (d: InputType): Resolvable<InputType> => {
  //       return { ...d, __resolveType: toStringBarResolver.name };
  //     };
  //     const resolverMap = {
  //       toStringBarResolver: spy(toStringBarResolver),
  //       addToStringBarResolver: spy(addToStringBarResolver),
  //     };

  //     const ctx = { ...context, resolvers: resolverMap };
  //     const result = await resolve<OutputType>(
  //       {
  //         bar: 10,
  //         __resolveType: addToStringBarResolver.name,
  //       },
  //       ctx,
  //     );
  //     assertEquals(result, { barString: "10" });
  //     assertSpyCallArg(resolverMap.addToStringBarResolver, 0, 0, { bar: 10 });
  //     assertSpyCall(resolverMap.addToStringBarResolver, 0, {
  //       returned: { bar: 10, __resolveType: toStringBarResolver.name },
  //     });
  //     assertSpyCallArg(resolverMap.toStringBarResolver, 0, 0, { bar: 10 });
  //     assertSpyCall(resolverMap.toStringBarResolver, 0, {
  //       returned: { barString: "10" },
  //     });

  //     assertSpyCalls(resolverMap.addToStringBarResolver, 1);
  //     assertSpyCalls(resolverMap.toStringBarResolver, 1);
  //   },
  // );
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
      { ...context, resolvers: resolverMap, resolvables: resolvableMap },
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

  await t.step("should resolve nested properties", async () => {
    type TestType = {
      foo: string;
      bar: {
        value: number;
      };
      nested: {
        nested: {
          value: string;
        };
      };
    };
    type TestTypeParent = {
      foo: string;
      nested: {
        nested: {
          value: string;
        };
      };
      bar: number;
    };
    const resolverMap = {
      getNested: () => {
        return {
          value: "10",
        };
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
    const result = await resolve<
      TestType,
      BaseContext
    >(
      {
        foo: "hello",
        bar: 10,
        nested: {
          nested: { __resolveType: "getNested" },
        },
        __resolveType: "testResolver",
      },
      { ...context, resolvers: resolverMap },
    );
    assertEquals(result, {
      foo: "hello",
      bar: { value: 10 },
      nested: { nested: { value: "10" } },
    });
  });
});
