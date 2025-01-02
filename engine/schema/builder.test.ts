/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import {
  assertArrayIncludes,
  assertEquals,
  assertObjectMatch,
  fail,
} from "@std/assert";
import { newSchemaBuilder } from "./builder.ts";

Deno.test("DataUri type generation", () => {
  const schema = {
    schema: {
      definitions: {
        exampleDefinition: {
          type: "object" as const,
          properties: {
            id: { type: "string" as const },
            name: { type: "string" as const },
          },
          required: ["id", "name"],
        },
        exampleArrayDefinition: {
          type: "array" as const,
          items: { $ref: "#/definitions/exampleDefinition" },
        },
        exampleArrayArrayDefinition: {
          type: "array" as const,
          items: { $ref: "#/definitions/exampleArrayDefinition" },
        },
        exampleAnyOfDefinition: {
          anyOf: [
            { type: "string" as const },
            { type: "number" as const },
            { type: "boolean" as const },
          ],
        },
        nestedAnyOfDefinitionIside: {
          anyOf: [
            { type: "string" as const },
            { type: "number" as const },
            {
              anyOf: [
                { type: "boolean" as const },
                { type: "null" as const },
              ],
            },
          ],
        },
      },
      root: {
        base: {
          type: "object" as const,
          properties: {
            data: { $ref: "#/definitions/exampleDefinition" },
          },
          required: ["data"],
        },
      },
    },
    blockModules: [{
      blockType: "exampleBlock",
      functionKey: "exampleNamespace.exampleFunction",
      inputSchema: {
        type: "object" as const,
        name: "inputobj",
        value: {
          input: {
            title: "input",
            schemeable: {
              type: "inline" as const,
              name: "test",
              value: {
                type: "object" as const,
                properties: {
                  id: { type: "string" as const },
                  name: { type: "string" as const },
                },
                required: ["id", "name"],
              },
            },
            required: false,
          },
        },
      },
      outputSchema: {
        type: "object" as const,
        name: "inputobj",
        value: {
          input: {
            title: "input",
            schemeable: {
              type: "inline" as const,
              name: "test",
              value: {
                type: "object" as const,
                properties: {
                  id: { type: "string" as const },
                  name: { type: "string" as const },
                },
                required: ["id", "name"],
              },
            },
            required: false,
          },
        },
      },
      functionJSDoc: {
        type: "object" as const,
        properties: {
          description: { type: "string" as const },
        },
      },
    }],
    entrypoints: [],
  };
  const schemaBuilder = newSchemaBuilder(schema);
  const resultSchema = schemaBuilder.build();

  assertEquals(
    Object.keys(resultSchema.definitions).length,
    7,
    "4 definitions, nestedAnyOfDefinitionIside, resolvable and one block",
  );
  assertArrayIncludes(
    Object.keys(resultSchema.definitions),
    Object.keys(schema.schema.definitions),
  );
});
