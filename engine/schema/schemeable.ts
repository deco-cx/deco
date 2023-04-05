import { JSONSchema7 } from "$live/deps.ts";
import { Schemeable } from "$live/engine/schema/transform.ts";
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
    case "intersection": {
      return schemeable.value.reduce(
        ([currDef, currSchema], curr) => {
          const [ndef, sc] = schemeableToJSONSchema(genId, currDef, curr);
          return [
            ndef,
            {
              ...currSchema,
              allOf: [...currSchema.allOf!, sc],
            },
          ];
        },
        [
          def,
          {
            allOf: [],
          },
        ] as [Record<string, JSONSchema7>, JSONSchema7],
      );
    }
    case "union": {
      const [defNew, sc] = schemeable.value.reduce(
        ([currDef, currSchema, typeIsCommon], curr) => {
          const [ndef, sc] = schemeableToJSONSchema(genId, currDef, curr);
          const type = typeIsCommon && sc.type &&
              (sc.type === currSchema.type || !currSchema.type)
            ? sc.type
            : undefined;
          return [
            ndef,
            {
              ...currSchema,
              type: typeIsCommon ? type : undefined,
              anyOf: [...currSchema.anyOf!, sc],
            },
            type !== undefined,
          ];
        },
        [
          def,
          {
            anyOf: [],
          },
          true,
        ] as [Record<string, JSONSchema7>, JSONSchema7, boolean],
      );
      return [defNew, sc];
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
            {
              ...properties,
              [property]: {
                ...sc,
                ...jsDocSchema,
                title: title ?? sc.title ?? jsDocSchema?.title,
              },
            },
          ];
        },
        [currDef, {}],
      );
      return [
        nDef,
        {
          type: "object",
          allOf: allOf && allOf.length > 0 ? allOf : undefined,
          properties,
          required: schemeable.required,
          title: schemeable.title ?? schemeable.name,
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
  const jsonSchema = {
    ...curr,
    ...ischemeable.jsDocSchema ?? {},
    title: ischemeable?.jsDocSchema?.title ?? schemeable.friendlyId ??
      curr?.title,
  };

  if (schemeableId && curr.type !== "null") { // null should not be created as a separated type
    return [
      {
        ...nSchema,
        [schemeableId]: jsonSchema,
      },
      { $ref: `#/definitions/${schemeableId}` },
    ];
  }
  return [nSchema, jsonSchema];
};
