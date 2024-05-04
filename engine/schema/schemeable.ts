import { JSONSchema7 } from "../../deps.ts";
import { Schemeable } from "../../engine/schema/transform.ts";
const schemeableToJSONSchemaFunc = (
  genId: (s: Schemeable) => string | undefined,
  def: Record<string, JSONSchema7>,
  schemeable: Schemeable,
  seen: Map<string, boolean>,
): [Record<string, JSONSchema7>, JSONSchema7] => {
  const type = schemeable.type;
  switch (type) {
    case "alias": {
      const [newDefs, schema] = schemeableToJSONSchema(
        genId,
        def,
        schemeable.value,
        seen,
      );
      return schemeableToJSONSchema(genId, newDefs, {
        name: schemeable.name,
        type: "inline",
        value: schema,
      }, seen);
    }
    case "array": {
      if (Array.isArray(schemeable.value)) {
        let nDef = def;
        const items: JSONSchema7[] = [];

        for (const sc of schemeable.value) {
          const [newDefs, newItems] = schemeableToJSONSchema(
            genId,
            nDef,
            sc,
            seen,
          );
          items.push(newItems);
          nDef = newDefs;
        }
        return [nDef, {
          type: "array",
          items,
        }];
      }
      const [nDef, items] = schemeableToJSONSchema(
        genId,
        def,
        schemeable.value,
        seen,
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
          const [ndef, sc] = schemeableToJSONSchema(genId, currDef, curr, seen);
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
          const [ndef, sc] = schemeableToJSONSchema(genId, currDef, curr, seen);
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
          const [nDef, sc] = schemeableToJSONSchema(
            genId,
            def,
            schemeable,
            seen,
          );
          return [nDef, [...exts, sc]];
        },
        [def, [] as JSONSchema7[]],
      );
      const [nDef, properties, required] = Object.entries(
        schemeable.value,
      )
        .reduce(
          (
            [currDef, properties, req],
            [property, val],
          ) => {
            if (!val) {
              return [currDef, properties, req];
            }
            const { schemeable, title, jsDocSchema, required } = val;
            const [nDef, sc] = schemeableToJSONSchema(
              genId,
              currDef,
              schemeable,
              seen,
            );

            return [
              nDef,
              {
                ...properties,
                [property]: {
                  ...sc,
                  ...jsDocSchema,
                  title: jsDocSchema?.title ?? title ?? sc.title,
                },
              },
              [...req, ...required ? [property] : []],
            ];
          },
          [
            currDef,
            {},
            [] as string[],
          ],
        );

      const obj: JSONSchema7 = {
        type: "object",
        allOf: allOf && allOf.length > 0 ? allOf : undefined,
        properties,
        required,
        title: schemeable.title ?? schemeable.name,
      };
      return [
        nDef,
        obj,
      ];
    }
    case "record": {
      const [nDef, properties] = schemeableToJSONSchema(
        genId,
        def,
        schemeable.value,
        seen,
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
      return [def, { type: "object" }];
  }
};
export const schemeableToJSONSchema = (
  genId: (s: Schemeable) => string | undefined,
  def: Record<string, JSONSchema7>,
  ischemeable: Schemeable,
  seen?: Map<string, boolean>,
): [Record<string, JSONSchema7>, JSONSchema7] => {
  seen ??= new Map();
  const schemeableId = ischemeable.id ?? genId(ischemeable);
  if (!schemeableId) {
    return schemeableToJSONSchemaFunc(genId, def, ischemeable, seen);
  }

  const seenValue = seen.get(schemeableId);
  const schemeable = { ...ischemeable, id: schemeableId };
  if (def[schemeableId] || seenValue) {
    return [def, { $ref: `#/definitions/${schemeableId}` }];
  }
  seen.set(schemeableId, true);
  const [nSchema, curr] = schemeableToJSONSchemaFunc(
    genId,
    def,
    schemeable,
    seen,
  );
  const jsonSchema = {
    ...curr,
    ...ischemeable.jsDocSchema ?? {},
    title: ischemeable?.jsDocSchema?.title ?? schemeable.friendlyId ??
      curr?.title ?? schemeable.name,
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
  return [
    nSchema,
    jsonSchema,
  ];
};
