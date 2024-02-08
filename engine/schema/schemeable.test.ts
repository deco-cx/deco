/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { assertEquals, assertObjectMatch, fail } from "std/assert/mod.ts";
import { dirname, join } from "std/path/mod.ts";

import { fromFileUrl, toFileUrl } from "std/path/mod.ts";
import { assertSpyCall, assertSpyCalls, spy } from "std/testing/mock.ts";
import { parsePath } from "../../engine/schema/parser.ts";
import { schemeableToJSONSchema } from "../../engine/schema/schemeable.ts";
import {
  Schemeable,
  typeNameToSchemeable,
} from "../../engine/schema/transform.ts";

const folder = dirname(fromFileUrl(import.meta.url));
const file = "schemeable.test.types.ts";
const path = join(folder, file);

const getSchemeableFor = async (
  name: string,
): Promise<Schemeable | undefined> => {
  const ast = await parsePath(toFileUrl(path).toString());
  return await typeNameToSchemeable(name, { path, parsedSource: ast! });
};

Deno.test("DataUri type generation", async () => {
  const transformed = await getSchemeableFor("MyDataUriType");
  if (!transformed) {
    fail("MyDataUriType should exists");
  }

  assertEquals(transformed, {
    jsDocSchema: {},
    type: "object",
    value: {
      a: {
        title: "A",
        jsDocSchema: {},
        schemeable: {
          type: "inline",
          name: "string",
          value: { type: "string" },
        },
        required: true,
      },
    },
    file: "data:text/tsx,export interface MyDataUriType { a: string; };",
    name: "MyDataUriType",
    extends: [],
  });
});

Deno.test("TypeWithExtendsOmit type generation", async () => {
  const transformed = await getSchemeableFor("TypeWithExtendsOmit");
  if (!transformed) {
    fail("TypeWithExtendsOmit should exists");
  }

  assertEquals(transformed, {
    "jsDocSchema": {},
    "type": "object",
    "value": {
      "page": {
        "title": "Page",
        "jsDocSchema": {},
        "schemeable": {
          "type": "inline",
          "name": "number",
          "value": { "type": "number" },
        },
        "required": true,
      },
    },
    "file": path,
    "name": "TypeWithExtendsOmit",
    "extends": [{
      "jsDocSchema": {},
      "type": "object",
      "value": {
        "title": {
          "title": "Title",
          "jsDocSchema": {},
          "schemeable": {
            "type": "inline",
            "name": "string",
            "value": { "type": "string" },
          },
          "required": true,
        },
      },
      "file": path,
      "name": "omitanNvbkxEComplexType",
      "extends": [],
    }],
  });
});
Deno.test("Simple type generation", async () => {
  const transformed = await getSchemeableFor("SimpleType");
  if (!transformed) {
    fail("SimpleType should exists");
  }

  const name = Deno.build.os === "windows" ? "tl@158-179" : "tl@156-175";
  assertEquals(transformed, {
    file: path,
    type: "alias",
    jsDocSchema: {},
    name: "SimpleType",
    value: {
      name,
      file: path,
      type: "object",
      value: {
        name: {
          title: "Name",
          required: true,
          jsDocSchema: {},
          schemeable: {
            name: "string",
            type: "inline",
            value: {
              type: "string",
            },
          },
        },
      },
    },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    "$ref": `#/definitions/${rands[1]}`,
    "title": "SimpleType",
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });

  assertSpyCall(genId, 1, {
    args: [{
      file: path,
      name,
      type: "object",
      value: {
        name: {
          jsDocSchema: {},
          required: true,
          title: "Name",
          schemeable: {
            name: "string",
            type: "inline",
            value: {
              type: "string",
            },
          },
        },
      },
    }],
    returned: rands[1],
  });

  assertSpyCalls(genId, 4);
});

Deno.test("TwoRefsProperties type generation", async () => {
  const transformed = await getSchemeableFor("TwoRefsProperties");

  if (!transformed) {
    fail("TwoRefsProperties should exists");
  }

  const name = Deno.build.os === "windows" ? "tl@721-791" : "tl@683-750";
  assertObjectMatch(transformed, {
    "type": "alias",
    "jsDocSchema": {},
    "value": {
      "file": path,
      name,
      "type": "object",
      "value": {
        "firstRef": {
          "title": "First Ref",
          "jsDocSchema": {},
          "schemeable": {
            "file": path,
            "type": "array",
            "name": "[SimpleInterface]",
            "value": {
              "jsDocSchema": {},
              "type": "object",
              "value": {
                "name": {
                  "title": "Name",
                  "jsDocSchema": {},
                  "schemeable": {
                    "type": "inline",
                    "name": "string",
                    "value": { "type": "string" },
                  },
                  "required": true,
                },
              },
              "file": path,
              "name": "SimpleInterface",
              "extends": [],
            },
          },
          "required": true,
        },
        "anotherRef": {
          "title": "Another Ref",
          "jsDocSchema": {},
          "schemeable": {
            "file": path,
            "type": "array",
            "name": "[SimpleInterface]",
            "value": {
              "jsDocSchema": {},
              "type": "object",
              "value": {
                "name": {
                  "title": "Name",
                  "jsDocSchema": {},
                  "schemeable": {
                    "type": "inline",
                    "name": "string",
                    "value": { "type": "string" },
                  },
                  "required": true,
                },
              },
              "file": path,
              "name": "SimpleInterface",
              "extends": [],
            },
          },
          "required": true,
        },
      },
    },
    "file": path,
    "name": "TwoRefsProperties",
  });

  const createHash = (input: string) => btoa(input);

  /* Types:
  object_TwoRefsProperties
  array_SimpleInterface[]
  object_SimpleInterface
  inline_undefined
  array_SimpleInterface[]
  */
  const genId = (schemable: Schemeable) => {
    return createHash(schemable.type + "_" + schemable.name);
  };

  const [definitions, _] = schemeableToJSONSchema(genId, {}, transformed);

  const schemaId = createHash("alias_TwoRefsProperties");

  assertObjectMatch(definitions[schemaId], {
    "$ref": "#/definitions/aW5saW5lX1R3b1JlZnNQcm9wZXJ0aWVz",
    "title": "TwoRefsProperties",
  });

  //assertEquals(5, definitions.);
});

Deno.test("Simple interface generation", async () => {
  const transformed = await getSchemeableFor("SimpleInterface");
  if (!transformed) {
    fail("SimpleInterface should exists");
  }
  assertEquals(transformed, {
    extends: [],
    file: path,
    jsDocSchema: {},
    name: "SimpleInterface",
    type: "object",
    value: {
      name: {
        required: true,
        title: "Name",
        jsDocSchema: {},
        schemeable: {
          name: "string",
          type: "inline",
          value: {
            type: "string",
          },
        },
      },
    },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    allOf: undefined,
    title: "SimpleInterface",
    type: "object",
    properties: {
      name: {
        $ref: `#/definitions/${rands[1]}`,
        title: "Name",
      },
    },
    required: ["name"],
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });
  assertSpyCall(genId, 1, {
    args: [{ type: "inline", value: { type: "string" }, name: "string" }],
    returned: rands[1],
  });

  assertSpyCalls(genId, 2);
});

Deno.test("Non required fields generation", async () => {
  const transformed = await getSchemeableFor("NonRequiredFields");
  if (!transformed) {
    fail("NonRequiredFields should exists");
  }
  assertEquals(transformed, {
    extends: [],
    file: path,
    jsDocSchema: {},
    name: "NonRequiredFields",
    type: "object",
    value: {
      name: {
        required: true,
        jsDocSchema: {},
        title: "Name",
        schemeable: {
          type: "inline",
          name: "string",
          value: { type: "string" },
        },
      },
      maybeName: {
        required: false,
        jsDocSchema: {},
        title: "Maybe Name",
        schemeable: {
          type: "inline",
          name: "string",
          value: { type: ["string", "null"] },
        },
      },
    },
  });

  const rands: [string, string, undefined] = [
    crypto.randomUUID(),
    crypto.randomUUID(),
    undefined,
  ];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    allOf: undefined,
    type: "object",
    title: "NonRequiredFields",
    properties: {
      maybeName: {
        title: "Maybe Name",
        type: ["string", "null"],
      },
      name: {
        $ref: `#/definitions/${rands[1]}`,
        title: "Name",
      },
    },
    required: ["name"],
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });
  assertSpyCall(genId, 1, {
    args: [{ type: "inline", value: { type: "string" }, name: "string" }],
    returned: rands[1],
  });

  assertSpyCall(genId, 2, {
    args: [{
      type: "inline",
      value: { type: ["string", "null"] },
      name: "string",
    }],
    returned: rands[2],
  });

  assertSpyCalls(genId, 3);
});

Deno.test("Union types generation", async () => {
  const transformed = await getSchemeableFor("UnionTypes");
  if (!transformed) {
    fail("UnionTypes should exists");
  }

  assertEquals(transformed, {
    extends: [],
    file: path,
    jsDocSchema: {},
    name: "UnionTypes",
    type: "object",
    value: {
      name: {
        jsDocSchema: {},
        title: "Name",
        required: true,
        schemeable: {
          file: undefined,
          name: "string|number",
          value: [
            { type: "inline", value: { type: "string" }, name: "string" },
            { type: "inline", value: { type: "number" }, name: "number" },
          ],
          type: "union",
        },
      },
    },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    allOf: undefined,
    title: "UnionTypes",
    type: "object",
    properties: {
      name: {
        $ref: `#/definitions/${rands[1]}`,
        title: "Name",
      },
    },
    required: ["name"],
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });
  assertSpyCall(genId, 1, {
    args: [
      {
        file: undefined,
        name: "string|number",
        type: "union",
        value: [
          { type: "inline", value: { type: "string" }, name: "string" },
          { type: "inline", value: { type: "number" }, name: "number" },
        ],
      },
    ],
    returned: rands[1],
  });

  assertSpyCalls(genId, 4);
});

Deno.test("Array fields generation", async () => {
  const transformed = await getSchemeableFor("ArrayFields");
  if (!transformed) {
    fail("ArrayFields should exists");
  }
  assertEquals(transformed, {
    extends: [],
    file: path,
    jsDocSchema: {},
    name: "ArrayFields",
    type: "object",
    value: {
      array: {
        required: true,
        jsDocSchema: {},
        title: "Array",
        schemeable: {
          file: undefined,
          name: "[string]",
          type: "array",
          value: { type: "inline", value: { type: "string" }, name: "string" },
        },
      },
    },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    allOf: undefined,
    title: "ArrayFields",
    type: "object",
    properties: {
      array: {
        $ref: `#/definitions/${rands[1]}`,
        title: "Array",
      },
    },
    required: ["array"],
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });
  assertSpyCall(genId, 1, {
    args: [
      {
        file: undefined,
        name: "[string]",
        type: "array",
        value: { type: "inline", value: { type: "string" }, name: "string" },
      },
    ],
    returned: rands[1],
  });

  assertSpyCalls(genId, 3);
});

Deno.test("Type reference generation", async () => {
  const transformed = await getSchemeableFor("InterfaceWithTypeRef");
  if (!transformed) {
    fail("InterfaceWithTypeRef should exists");
  }

  assertEquals(transformed, {
    extends: [],
    file: path,
    jsDocSchema: {},
    name: "InterfaceWithTypeRef",
    type: "object",
    value: {
      ref: {
        required: true,
        jsDocSchema: {},
        title: "Ref",
        schemeable: {
          extends: [],
          file: path,
          jsDocSchema: {},
          name: "SimpleInterface",
          type: "object",
          value: {
            name: {
              required: true,
              title: "Name",
              jsDocSchema: {},
              schemeable: {
                type: "inline",
                name: "string",
                value: { type: "string" },
              },
            },
          },
        },
      },
    },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    allOf: undefined,
    title: "InterfaceWithTypeRef",
    type: "object",
    properties: {
      ref: {
        $ref: `#/definitions/${rands[1]}`,
        title: "Ref",
      },
    },
    required: ["ref"],
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });
  assertSpyCall(genId, 1, {
    args: [
      {
        extends: [],
        file: path,
        jsDocSchema: {},
        name: "SimpleInterface",
        type: "object",
        value: {
          name: {
            required: true,
            jsDocSchema: {},
            title: "Name",
            schemeable: {
              name: "string",
              type: "inline",
              value: {
                type: "string",
              },
            },
          },
        },
      },
    ],
    returned: rands[1],
  });

  assertSpyCalls(genId, 3);
});

Deno.test("JSDoc tags injection", async () => {
  const transformed = await getSchemeableFor("WithTags");
  if (!transformed) {
    fail("WithTags should exists");
  }
  assertEquals(transformed, {
    type: "object",
    extends: [],
    file: path,
    jsDocSchema: {},
    name: "WithTags",
    value: {
      email: {
        required: true,
        jsDocSchema: {
          description: "add your email",
          format: "email",
          title: "Email",
        },
        title: "Email",
        schemeable: {
          name: "string",
          type: "inline",
          value: {
            type: "string",
          },
        },
      },
    },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    allOf: undefined,
    title: "WithTags",
    type: "object",
    properties: {
      email: {
        $ref: `#/definitions/${rands[1]}`,
        description: "add your email",
        format: "email",
        title: "Email",
      },
    },
    required: ["email"],
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });
  assertSpyCall(genId, 1, {
    args: [
      {
        name: "string",
        type: "inline",
        value: { type: "string" },
      },
    ],
    returned: rands[1],
  });

  assertSpyCalls(genId, 2);
});

Deno.test("Type alias generation", async () => {
  const transformed = await getSchemeableFor("TypeAlias");
  if (!transformed) {
    fail("TypeAlias should exists");
  }
  assertEquals(transformed, {
    file: path,
    jsDocSchema: {},
    name: "TypeAlias",
    type: "alias",
    value: { type: "inline", name: "string", value: { type: "string" } },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    $ref: `#/definitions/${rands[1]}`,
    title: "TypeAlias",
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });

  assertSpyCalls(genId, 3);
});

Deno.test("Wellknown in types generation", async () => {
  const transformed = await getSchemeableFor("WellKnown");
  if (!transformed) {
    fail("WellKnown should exists");
  }

  assertEquals(transformed, {
    name: "WellKnown",
    file: path,
    jsDocSchema: {},
    extends: [],
    type: "object",
    value: {
      array: {
        required: true,
        jsDocSchema: {},
        schemeable: {
          file: undefined,
          name: "[string]",
          type: "array",
          value: { type: "inline", value: { type: "string" }, name: "string" },
        },
        title: "Array",
      },
      record: {
        required: true,
        jsDocSchema: {},
        schemeable: {
          name: "record<string>",
          type: "record",
          value: { type: "inline", value: { type: "string" }, name: "string" },
        },
        title: "Record",
      },
      section: {
        required: true,
        jsDocSchema: {},
        schemeable: {
          file: path,
          type: "inline",
          value: { $ref: "#/root/sections" },
          name: "sections",
        },
        title: "Section",
      },
      promiseValue: {
        required: true,
        jsDocSchema: {},
        schemeable: {
          type: "inline",
          value: { type: "string" },
          name: "string",
        },
        title: "Promise Value",
      },
      resolvable: {
        required: true,
        jsDocSchema: {},
        schemeable: {
          type: "inline",
          name: "Resolvable",
          value: { $ref: "#/definitions/Resolvable" },
        },
        title: "Resolvable",
      },
      preactComponent: {
        required: true,
        jsDocSchema: {},
        schemeable: {
          file: path,
          type: "inline",
          value: { $ref: "#/root/sections" },
          name: "sections",
        },
        title: "Preact Component",
      },
    },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    allOf: undefined,
    title: "WellKnown",
    type: "object",
    properties: {
      array: {
        $ref: `#/definitions/${rands[1]}`,
        title: "Array",
      },
      preactComponent: {
        $ref: "#/root/sections",
        title: "Preact Component",
      },
      promiseValue: {
        title: "Promise Value",
        type: "string",
      },
      record: {
        title: "Record",
        type: "object",
        additionalProperties: {
          type: "string",
        },
      },
      resolvable: {
        $ref: "#/definitions/Resolvable",
        title: "Resolvable",
      },
      section: {
        $ref: "#/root/sections",
        title: "Section",
      },
    },
    required: [
      "array",
      "record",
      "section",
      "promiseValue",
      "resolvable",
      "preactComponent",
    ],
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });

  assertSpyCalls(genId, 9);
});
