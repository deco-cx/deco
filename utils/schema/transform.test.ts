/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { assertEquals } from "std/testing/asserts.ts";

import { tsToSchema } from "./transform.ts";

const typesFile = "./utils/schema/transform.test.types.ts";

Deno.test("Simple type generation", async () => {
  const transformed = await tsToSchema(typesFile, "SimpleType");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: { name: { type: "string", title: "Name" } },
    required: ["name"],
  });
});

Deno.test("Simple interface generation", async () => {
  const transformed = await tsToSchema(typesFile, "SimpleInterface");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: { name: { type: "string", title: "Name" } },
    required: ["name"],
  });
});

Deno.test("Non required fields generation", async () => {
  const transformed = await tsToSchema(typesFile, "NonRequiredFields");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: {
      name: { type: "string", title: "Name" },
      maybeName: { type: ["string", "null"], title: "Maybe Name" },
    },
    required: ["name"],
  });
});

Deno.test("Union types generation", async () => {
  const transformed = await tsToSchema(typesFile, "UnionTypes");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: {
      name: {
        anyOf: [{ type: "string" }, { type: "number" }],
        title: "Name",
        type: "string",
      },
    },
    required: ["name"],
  });
});

Deno.test("Union types generation", async () => {
  const transformed = await tsToSchema(typesFile, "ArrayFields");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: {
      array: { type: "array", items: { type: "string" }, title: "Array" },
    },
    required: ["array"],
  });
});

Deno.test("Type reference generation", async () => {
  const transformed = await tsToSchema(typesFile, "InterfaceWithTypeRef");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: {
      ref: {
        title: "Ref",
        type: "object",
        properties: { name: { type: "string", title: "Name" } },
        required: ["name"],
      },
    },
    required: ["ref"],
  });
});

Deno.test("JSDoc tags injection", async () => {
  const transformed = await tsToSchema(typesFile, "WithTags");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: {
      email: {
        type: "string",
        title: "email",
        description: "add your email",
        format: "email",
      },
    },
    required: ["email"],
  });
});

Deno.test("Type alias generation", async () => {
  const transformed = await tsToSchema(typesFile, "TypeAlias");

  assertEquals(transformed, { type: "string" });
});

Deno.test("Type alias generation", async () => {
  const transformed = await tsToSchema(typesFile, "TypeAlias");

  assertEquals(transformed, { type: "string" });
});

Deno.test("Built in types generation", async () => {
  const transformed = await tsToSchema(typesFile, "BuiltInTypes");

  assertEquals(transformed, {
    title: undefined,
    type: "object",
    properties: {
      array: { title: "Array", type: "array", items: { type: "string" } },
      record: {
        title: "Record",
        type: "object",
        additionalProperties: { type: "string" },
      },
      loaderReturnType: {
        format: "live-function",
        "$id": "168110fffa5b1102c412d4eb453091e0cdfc8ba1",
        title: "Loader Return Type",
        type: "string",
      },
    },
    required: ["array", "record", "loaderReturnType"],
  });
});
