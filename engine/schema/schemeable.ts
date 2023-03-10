import { Schemeable } from "$live/engine/schema/transform.ts";
import { JSONSchema7 } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";

export const union = (s: Schemeable, ref: string): Schemeable => {
  const { id: _ignore, ...woId } = s;
  return {
    ...s,
    type: "union",
    value: [
      ...(woId.type === "union" ? woId.value : [woId]),
      {
        type: "inline",
        value: {
          $ref: ref,
        },
      },
    ],
  };
};
const schemeableToJSONSchemaFunc = (
  def: Record<string, JSONSchema7>,
  schemeable: Schemeable,
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const type = schemeable.type;
  switch (type) {
    case "array": {
      const [nDef, items] = schemeableToJSONSchema(def, schemeable.value);
      return [
        nDef,
        {
          type: "array",
          items,
        },
      ];
    }
    case "inline":
      return [def, schemeable.value];
    case "union": {
      return schemeable.value.reduce(
        ([currDef, currSchema], schemeable) => {
          const [ndef, sc] = schemeableToJSONSchema(currDef, schemeable);
          return [
            ndef,
            {
              ...currSchema,
              anyOf: [...currSchema.anyOf!, sc],
            },
          ];
        },
        [
          def,
          {
            anyOf: [],
          },
        ] as [Record<string, JSONSchema7>, JSONSchema7],
      );
    }
    case "object": {
      const [currDef, allOf] = (schemeable.extends ?? []).reduce(
        ([def, exts], schemeable) => {
          const [nDef, sc] = schemeableToJSONSchema(def, schemeable);
          return [nDef, [...exts, sc]];
        },
        [def, [] as JSONSchema7[]],
      );
      const [nDef, properties] = Object.entries(schemeable.value).reduce(
        (
          [currDef, properties],
          [property, { schemeable, title, jsDocSchema }],
        ) => {
          const [nDef, sc] = schemeableToJSONSchema(currDef, schemeable);
          return [
            nDef,
            { ...properties, [property]: { title, ...sc, ...jsDocSchema } },
          ];
        },
        [currDef, {}],
      );
      return [
        nDef,
        {
          type: "object",
          allOf,
          properties,
          required: schemeable.required,
          title: schemeable.title ?? schemeable.id,
        },
      ];
    }
    case "record": {
      const [nDef, properties] = schemeableToJSONSchema(def, schemeable.value);
      return [
        nDef,
        {
          title: schemeable.value.id
            ? `Record of ${schemeable.value.id}`
            : "Unknown record",
          type: "object",
          additionalProperties: properties,
        },
      ];
    }
    case "unknown":
    default:
      return [def, {}];
  }
};

export const schemeableToJSONSchema = (
  def: Record<string, JSONSchema7>,
  schemeable: Schemeable,
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const schemeableId = schemeable.id;
  if (schemeableId && def[schemeableId]) {
    return [def, { $ref: `#/definitions/${schemeableId}` }];
  }
  const [nSchema, curr] = schemeableToJSONSchemaFunc(def, schemeable);

  if (schemeableId) {
    return [
      {
        ...nSchema,
        [schemeableId]: nSchema[schemeableId] ?? { ...curr, $id: schemeableId },
      },
      { $ref: `#/definitions/${schemeableId}` },
    ];
  }
  return [nSchema, curr];
};
