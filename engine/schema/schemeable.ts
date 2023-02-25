import { mapObjKeys } from "$live/engine/core/utils.ts";
import { Schemeable } from "$live/engine/schema/transformv2.ts";
import * as J from "https://deno.land/x/jsonschema@v1.4.1/jsonschema.ts";

const schemeableToJSONSchemaFunc = (
  schemeable: Schemeable,
): J.JsonSchema<unknown> => {
  const type = schemeable.type;
  switch (type) {
    case "array": {
      return J.array(schemeableToJSONSchema(schemeable.value));
    }
    case "inline":
      return schemeable.value;
    case "union": {
      const tps = schemeable.value.map(schemeableToJSONSchema);
      let curr: J.JsonSchema<unknown> | undefined = undefined;
      for (const tp of tps) {
        if (curr === undefined) {
          curr = tp;
        } else {
          curr = J.union(curr)(tp);
        }
      }
      return curr!;
    }
    case "object": {
      return J.struct(
        mapObjKeys<
          typeof schemeable["value"],
          Record<string, J.JsonSchema<unknown>>
        >(
          schemeable.value,
          ({ schemeable }) => schemeableToJSONSchema(schemeable),
        ),
      );
    }
    case "record":
      return J.record(schemeableToJSONSchema(schemeable.value));
    case "unknown":
    default:
      return J.unknown;
  }
};
export const schemeableToJSONSchema = (
  schemeable: Schemeable,
): J.JsonSchema<unknown> => {
  const schemeableId = schemeable.id;
  const f = () => schemeableToJSONSchemaFunc(schemeable);
  return schemeableId ? J.lazy(schemeableId, f) : f();
};
