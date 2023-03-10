import { Schemeable } from "$live/engine/schema/transform.ts";
import { JSONSchema7 } from "json-schema";

const rmId = (sch: Schemeable): Schemeable => {
  if (sch.type === "object") {
    return { ...sch, id: undefined };
  }
  if (sch.type === "array") {
    return { ...sch, value: { ...sch.value, id: undefined }, id: undefined };
  }
  return sch;
};
export const union = (s: Schemeable, ref: string): Schemeable => {
  const woId = rmId(s);
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
        ([currDef, currSchema], curr) => {
          const [ndef, sc] = schemeableToJSONSchema(currDef, curr);
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

const hasTypeEquivalence = (s: JSONSchema7, sc: Schemeable): boolean => {
  const isMany = s.anyOf !== undefined && s.anyOf.length > 0;
  switch (sc.type) {
    case "array": {
      return s.type === "array" || isMany;
    }
    case "inline": {
      return s.type === sc.value.type || isMany;
    }
    case "record": {
      return (s.type === "object" && !!s.additionalProperties) || isMany;
    }
    case "union": {
      return isMany && s.anyOf!.length >= sc.value.length;
    }
    case "object": {
      return s.type === "object" || isMany;
    }
    default:
      return true;
  }
};
export const schemeableToJSONSchema = (
  def: Record<string, JSONSchema7>,
  schemeable: Schemeable,
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const schemeableId = schemeable.id;
  if (
    schemeableId &&
    def[schemeableId] &&
    hasTypeEquivalence(def[schemeableId], schemeable)
  ) {
    return [def, { $ref: `#/definitions/${schemeableId}` }];
  }
  const [nSchema, curr] = schemeableToJSONSchemaFunc(def, schemeable);

  if (schemeableId) {
    return [
      {
        ...nSchema,
        [schemeableId]: { ...curr, $id: schemeableId },
      },
      { $ref: `#/definitions/${schemeableId}` },
    ];
  }
  return [nSchema, curr];
};
