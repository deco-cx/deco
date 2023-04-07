import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Handler } from "$live/blocks/handler.ts";
import { RouteMod } from "$live/blocks/route.ts";
import { introspectWith } from "$live/engine/introspect.ts";
import { denoDoc } from "$live/engine/schema/utils.ts";
import { LiveConfig } from "$live/types.ts";
import { dirname } from "std/path/mod.ts";
import { assertEquals } from "std/testing/asserts.ts";

export interface Props {
  a: string;
}
export function funcTest(first: Props) {
  return first;
}
Deno.test("from params", async () => {
  const getConfigTsType = introspectWith<
    { funcTest: typeof funcTest; default: typeof funcTest }
  >({
    funcTest: "0",
  });
  const configRef = await getConfigTsType(
    {
      base: dirname(import.meta.url),
      namespace: "$live",
    },
    import.meta.url,
    await denoDoc(import.meta.url),
  );

  assertEquals(configRef?.inputSchema?.name, "Props");
});

export interface Props2 {
  test: string;
}
export function funcTest2(first: Props2) {
  return first;
}

Deno.test("from param prop", async () => {
  const getConfigTsType = introspectWith<
    { funcTest2: typeof funcTest2; default: typeof funcTest2 }
  >({
    funcTest2: ["0", "test"],
  });
  const configRef = await getConfigTsType(
    {
      base: dirname(import.meta.url),
      namespace: "$live",
    },
    import.meta.url,
    await denoDoc(import.meta.url),
  );

  assertEquals(configRef?.inputSchema?.type, "inline");
  assertEquals((configRef?.inputSchema as { value: unknown })?.value, {
    type: "string",
  });
});

export interface Props3<T> {
  test: T;
}

export function funcTest3(first: Props3<string>) {
  return first;
}

Deno.test("generics param", async () => {
  const getConfigTsType = introspectWith<
    { funcTest3: typeof funcTest3; default: typeof funcTest3 }
  >({
    funcTest3: ["0", "test"],
  });
  const configRef = await getConfigTsType(
    {
      base: dirname(import.meta.url),
      namespace: "$live",
    },
    import.meta.url,
    await denoDoc(import.meta.url),
  );

  assertEquals(configRef?.inputSchema?.type, "inline");
  assertEquals((configRef?.inputSchema as { value: unknown })?.value, {
    type: "string",
  });
});

export interface Entrypoint {
  handler: Handler;
}

export const handler = (
  _: Request,
  __: HandlerContext<
    unknown,
    LiveConfig<Entrypoint, unknown>
  >,
) => {
  return Response.error();
};

Deno.test("real test param", async () => {
  const getConfigTsType = introspectWith<
    RouteMod
  >({
    handler: ["1", "state.$live"],
  });
  const configRef = await getConfigTsType(
    {
      base: dirname(import.meta.url),
      namespace: "$live",
    },
    import.meta.url,
    await denoDoc(import.meta.url),
  );

  assertEquals(configRef?.inputSchema?.name, "Entrypoint");
});

export interface PageConfig {
  number: string;
}

export function Page(_: PageProps<PageConfig>) {
  return Response.error();
}

Deno.test("first available", async () => {
  const getConfigTsType = introspectWith<
    { Page: typeof Page; handler: typeof handler; default: typeof funcTest }
  >([{
    Page: ["0", "data"],
  }, {
    handler: ["1", "state.$live"],
  }]);
  const configRef = await getConfigTsType(
    {
      base: dirname(import.meta.url),
      namespace: "$live",
    },
    import.meta.url,
    await denoDoc(import.meta.url),
  );

  assertEquals(configRef?.inputSchema?.name, "PageConfig");
});
