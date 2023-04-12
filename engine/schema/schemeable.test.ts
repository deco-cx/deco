/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { dirname, join } from "https://deno.land/std@0.61.0/path/mod.ts";
import { assertEquals, fail } from "std/testing/asserts.ts";

import { schemeableToJSONSchema } from "$live/engine/schema/schemeable.ts";
import {
  findSchemeableFromNode,
  Schemeable,
} from "$live/engine/schema/transform.ts";
import { denoDoc } from "$live/engine/schema/utils.ts";
import { fromFileUrl } from "https://deno.land/std@0.170.0/path/mod.ts";
import {
  assertSpyCall,
  assertSpyCalls,
  spy,
} from "https://deno.land/std@0.179.0/testing/mock.ts";

const folder = dirname(import.meta.url);
const file = "schemeable.test.types.ts";
const filePath = fromFileUrl(join(folder, file));

const getSchemeableFor = async (
  name: string,
): Promise<Schemeable | undefined> => {
  const ast = await denoDoc(join(folder, file));
  const nodeTypeRef = ast.find((node) => node.name === name);
  if (!nodeTypeRef) {
    return undefined;
  }
  return await findSchemeableFromNode(nodeTypeRef, [filePath, ast], new Map());
};
Deno.test("Simple type generation", async () => {
  const transformed = await getSchemeableFor("SimpleType");
  if (!transformed) {
    fail("SimpleType should exists");
  }

  assertEquals(transformed, {
    file: filePath,
    jsDocSchema: undefined,
    name: "SimpleType",
    type: "object",
    value: {
      name: {
        title: "Name",
        required: true,
        jsDocSchema: undefined,
        schemeable: {
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
    title: "SimpleType",
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
    args: [{ type: "inline", value: { type: "string" } }],
    returned: rands[1],
  });

  assertSpyCalls(genId, 2);
});

Deno.test("Simple interface generation", async () => {
  const transformed = await getSchemeableFor("SimpleInterface");
  if (!transformed) {
    fail("SimpleInterface should exists");
  }
  assertEquals(transformed, {
    extends: undefined,
    file: filePath,
    jsDocSchema: undefined,
    name: "SimpleInterface",
    type: "object",
    value: {
      name: {
        required: true,
        title: "Name",
        jsDocSchema: undefined,
        schemeable: {
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
    args: [{ type: "inline", value: { type: "string" } }],
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
    extends: undefined,
    file: filePath,
    jsDocSchema: undefined,
    name: "NonRequiredFields",
    type: "object",
    value: {
      name: {
        required: true,
        jsDocSchema: undefined,
        title: "Name",
        schemeable: {
          type: "inline",
          value: { type: "string" },
        },
      },
      maybeName: {
        required: false,
        jsDocSchema: undefined,
        title: "Maybe Name",
        schemeable: {
          type: "inline",
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
    args: [{ type: "inline", value: { type: "string" } }],
    returned: rands[1],
  });

  assertSpyCall(genId, 2, {
    args: [{ type: "inline", value: { type: ["string", "null"] } }],
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
    extends: undefined,
    file: filePath,
    jsDocSchema: undefined,
    name: "UnionTypes",
    type: "object",
    value: {
      name: {
        jsDocSchema: undefined,
        title: "Name",
        required: true,
        schemeable: {
          file: undefined,
          name:
            "47fb2fe93d8a63166d8156d088239aa2|f4e2fa6a639dd0d858a2d18a5c9d2890",
          value: [
            { type: "inline", value: { type: "string" } },
            { type: "inline", value: { type: "number" } },
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
        name:
          "47fb2fe93d8a63166d8156d088239aa2|f4e2fa6a639dd0d858a2d18a5c9d2890",
        type: "union",
        value: [
          { type: "inline", value: { type: "string" } },
          { type: "inline", value: { type: "number" } },
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
    extends: undefined,
    file: filePath,
    jsDocSchema: undefined,
    name: "ArrayFields",
    type: "object",
    value: {
      array: {
        required: true,
        jsDocSchema: undefined,
        title: "Array",
        schemeable: {
          file: undefined,
          name: undefined,
          type: "array",
          value: { type: "inline", value: { type: "string" } },
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
        name: undefined,
        type: "array",
        value: { type: "inline", value: { type: "string" } },
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
    extends: undefined,
    file: filePath,
    jsDocSchema: undefined,
    name: "InterfaceWithTypeRef",
    type: "object",
    value: {
      ref: {
        required: true,
        jsDocSchema: undefined,
        title: "Ref",
        schemeable: {
          extends: undefined,
          file: filePath,
          jsDocSchema: undefined,
          name: "SimpleInterface",
          type: "object",
          value: {
            name: {
              required: true,
              title: "Name",
              jsDocSchema: undefined,
              schemeable: {
                type: "inline",
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
        extends: undefined,
        file: filePath,
        jsDocSchema: undefined,
        name: "SimpleInterface",
        type: "object",
        value: {
          name: {
            required: true,
            jsDocSchema: undefined,
            title: "Name",
            schemeable: {
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
    extends: undefined,
    file: filePath,
    jsDocSchema: undefined,
    name: "WithTags",
    value: {
      email: {
        required: true,
        jsDocSchema: {
          description: "add your email",
          format: "email",
          title: "email",
        },
        title: "Email",
        schemeable: {
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
    file: filePath,
    jsDocSchema: undefined,
    name: "TypeAlias",
    type: "inline",
    value: { type: "string" },
  });

  const rands = [crypto.randomUUID(), crypto.randomUUID()];
  let calls = 0;

  const genId = spy((_: Schemeable) => rands[calls++]);
  const [definitions, ref] = schemeableToJSONSchema(genId, {}, transformed);
  assertEquals(ref.$ref, `#/definitions/${rands[0]}`);
  assertEquals(definitions[rands[0]], {
    title: "TypeAlias",
    type: "string",
  });

  assertSpyCall(genId, 0, {
    args: [transformed],
    returned: rands[0],
  });

  assertSpyCalls(genId, 1);
});

Deno.test("Wellknown in types generation", async () => {
  const transformed = await getSchemeableFor("WellKnown");
  if (!transformed) {
    fail("WellKnown should exists");
  }

  assertEquals(transformed, {
    name: "WellKnown",
    file: filePath,
    jsDocSchema: undefined,
    extends: undefined,
    type: "object",
    value: {
      array: {
        required: true,
        jsDocSchema: undefined,
        schemeable: {
          name: undefined,
          type: "array",
          value: { type: "inline", value: { type: "string" } },
        },
        title: "Array",
      },
      record: {
        required: true,
        jsDocSchema: undefined,
        schemeable: {
          file: undefined,
          name: undefined,
          type: "record",
          value: { type: "inline", value: { type: "string" } },
        },
        title: "Record",
      },
      section: {
        required: true,
        jsDocSchema: undefined,
        schemeable: { type: "inline", value: { $ref: "#/root/sections" } },
        title: "Section",
      },
      promiseValue: {
        required: true,
        jsDocSchema: undefined,
        schemeable: { type: "inline", value: { type: "string" } },
        title: "Promise Value",
      },
      resolvable: {
        required: true,
        jsDocSchema: undefined,
        schemeable: {
          type: "inline",
          value: { $ref: "#/definitions/Resolvable" },
        },
        title: "Resolvable",
      },
      preactComponent: {
        required: true,
        jsDocSchema: undefined,
        schemeable: { type: "inline", value: { $ref: "#/root/sections" } },
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
