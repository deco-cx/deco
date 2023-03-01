import { Schemeable } from "$live/engine/schema/transform.ts";
import { JSONSchema7 } from "https://esm.sh/@types/json-schema@7.0.11?pin=102";

export const union = (a: Schemeable, b: Schemeable): Schemeable => {
  return {
    id: a.id ?? b.id,
    type: "union",
    value: [a, b],
  };
};
const schemeableToJSONSchemaFunc = (
  def: Record<string, JSONSchema7>,
  schemeable: Schemeable
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const type = schemeable.type;
  switch (type) {
    case "array": {
      return schemeableToJSONSchema(def, schemeable.value);
    }
    case "inline":
      return [def, schemeable.value];
    case "union": {
      return schemeable.value.reduce(
        ([currDef, currSchema], schemeable) => {
          const [ndef, sc] = schemeableToJSONSchema(currDef, schemeable);
          return [ndef, { ...currSchema, anyOf: [...currSchema.anyOf!, sc] }];
        },
        [
          def,
          {
            type: schemeable.value[0].type,
            anyOf: [],
          },
        ] as [Record<string, JSONSchema7>, JSONSchema7]
      );
    }
    case "object": {
      const [_, properties] = Object.entries(schemeable.value).reduce(
        (
          [currDef, properties],
          [property, { schemeable, title, jsDocSchema }]
        ) => {
          const [nDef, sc] = schemeableToJSONSchema(currDef, schemeable);
          return [
            nDef,
            { ...properties, [property]: { title, ...sc, ...jsDocSchema } },
          ];
        },
        [def, {}]
      );
      return [
        def,
        {
          type: "object",
          properties,
          required: schemeable.required,
          title: schemeable.title,
        },
      ];
    }
    case "record": {
      const [nDef, properties] = schemeableToJSONSchema(def, schemeable.value);
      return [
        nDef,
        {
          title: "Record",
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
  schemeable: Schemeable
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const schemeableId = schemeable.id;
  if (schemeableId && def[schemeableId]) {
    return [def, def[schemeableId]];
  }
  const [nSchema, curr] = schemeableToJSONSchemaFunc(def, schemeable);

  if (schemeableId) {
    return [{ ...nSchema, [schemeableId]: curr }, curr];
  }
  return [nSchema, curr];
};
