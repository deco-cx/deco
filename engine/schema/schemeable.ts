import { Schemeable } from "$live/engine/schema/transform.ts";
import { JSONSchema7 } from "$live/deps.ts";
export interface TransformContext {
  key: string;
}
const schemeableToJSONSchemaFunc = (
  genId: (s: Schemeable) => string | undefined,
  def: Record<string, JSONSchema7>,
  schemeable: Schemeable,
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const type = schemeable.type;
  switch (type) {
    case "array": {
      const [nDef, items] = schemeableToJSONSchema(
        genId,
        def,
        schemeable.value,
      );
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
          const [ndef, sc] = schemeableToJSONSchema(genId, currDef, curr);
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
          if (schemeable.type === "unknown") {
            return [def, exts];
          }
          const [nDef, sc] = schemeableToJSONSchema(genId, def, schemeable);
          return [nDef, [...exts, sc]];
        },
        [def, [] as JSONSchema7[]],
      );
      const [nDef, properties] = Object.entries(schemeable.value).reduce(
        (
          [currDef, properties],
          [property, { schemeable, title, jsDocSchema }],
        ) => {
          const [nDef, sc] = schemeableToJSONSchema(genId, currDef, schemeable);
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
      const [nDef, properties] = schemeableToJSONSchema(
        genId,
        def,
        schemeable.value,
      );
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
  genId: (s: Schemeable) => string | undefined,
  def: Record<string, JSONSchema7>,
  ischemeable: Schemeable,
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const schemeableId = ischemeable.id ?? genId(ischemeable);
  const schemeable = { ...ischemeable, id: schemeableId };
  if (schemeableId && def[schemeableId]) {
    return [def, { $ref: `#/definitions/${schemeableId}` }];
  }
  const [nSchema, curr] = schemeableToJSONSchemaFunc(genId, def, schemeable);

  if (schemeableId) {
    return [
      {
        ...nSchema,
        [schemeableId]: {
          ...curr,
          $id: schemeable.friendlyId ?? schemeableId,
          title: schemeable.friendlyId ?? curr?.title,
        },
      },
      { $ref: `#/definitions/${schemeableId}` },
    ];
  }
  return [nSchema, curr];
};
