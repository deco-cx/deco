import { mapObjKeys } from "$live/engine/core/utils.ts";
import { Schemeable } from "$live/engine/schema/transformv2.ts";
import * as J from "https://deno.land/x/fun@v2.0.0-alpha.10/json_schema.ts";

const schemeableToJSONSchemaFunc = (
  schemeable: Schemeable,
): J.JsonBuilder<unknown> => {
  const type = schemeable.type;
  switch (type) {
    case "array": {
      return J.array(schemeableToJSONSchema(schemeable.value));
    }
    case "inline":
      return schemeable.value;
    case "union": {
      const tps = schemeable.value.map(schemeableToJSONSchema);
      let curr: J.JsonBuilder<unknown> | undefined = undefined;
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
          Record<string, J.JsonBuilder<unknown>>
        >(
          schemeable.value,
          (
            { schemeable }, // FIXME is not considering properties jsDocs schema
          ) => schemeableToJSONSchema(schemeable),
        ),
      );
    }
    case "record":
      return J.record(schemeableToJSONSchema(schemeable.value));
    case "unknown":
    default:
      return J.unknown();
  }
};
export const schemeableToJSONSchema = (
  schemeable: Schemeable,
): J.JsonBuilder<unknown> => {
  const schemeableId = schemeable.id;
  const f = () => schemeableToJSONSchemaFunc(schemeable);
  return schemeableId ? J.lazy(schemeableId, f) : f();
};
