import { Handler, LiveConfig } from "$live/blocks/handler.ts";
import { introspectWith } from "$live/engine/introspect.ts";
import { denoDoc } from "$live/engine/schema/utils.ts";
import { LiveState } from "$live/types.ts";
import { HandlerContext } from "https://deno.land/x/fresh@1.1.2/server.ts";
import { dirname } from "std/path/mod.ts";
import { assertEquals } from "std/testing/asserts.ts";

export interface Props {
  a: string;
}
export function funcTest(first: Props) {
  return first;
}
Deno.test("from params", async () => {
  const getConfigTsType = introspectWith({
    funcTest: 0,
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
  const getConfigTsType = introspectWith({
    funcTest2: {
      0: "test",
    },
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
  const getConfigTsType = introspectWith({
    funcTest3: {
      0: "test",
    },
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
    LiveConfig<Entrypoint, LiveState>
  >,
) => {
  return Response.error();
};

Deno.test("real test param", async () => {
  const getConfigTsType = introspectWith({
    handler: {
      1: {
        "state": "$live",
      },
    },
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
