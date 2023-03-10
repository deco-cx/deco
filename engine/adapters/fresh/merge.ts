// deno-lint-ignore-file no-explicit-any
import { Schemas } from "$live/engine/adapters/fresh/manifestBuilder.ts";
import { JSONSchema7 } from "json-schema";

const isJSONSchema = <T>(s: T | JSONSchema7): s is JSONSchema7 => {
  return (
    (s as JSONSchema7)?.type !== undefined ||
    (s as JSONSchema7)?.$ref !== undefined ||
    (s as JSONSchema7)?.$id !== undefined ||
    (s as JSONSchema7)?.anyOf !== undefined
  );
};
export const deepMergeDefinitions = (
  def: Schemas["definitions"],
  defOther: Schemas["definitions"]
): Schemas["definitions"] => {
  const newObj: Record<string, any> = {};
  for (const key of new Set([...Object.keys(def), ...Object.keys(defOther)])) {
    if (!def[key]) {
      newObj[key] = defOther[key];
    } else if (!defOther[key]) {
      newObj[key] = def[key];
    } else {
      const defObj = def[key];
      const defOtherObj = defOther[key];
      if (isJSONSchema(defObj) && isJSONSchema(defOtherObj)) {
        const anyOf = [];
        if (defObj.anyOf && defObj.anyOf.length > 0) {
          anyOf.push(...defObj.anyOf);
        } else {
          anyOf.push(defObj);
        }

        if (defOtherObj.anyOf && defOtherObj.anyOf.length > 0) {
          anyOf.push(...defOtherObj.anyOf);
        } else {
          anyOf.push(defOtherObj);
        }

        newObj[key] = { ...anyOf, $id: defObj.$id ?? defOtherObj.$id };
      } else if (
        typeof defObj === "object" &&
        typeof defOtherObj === "object"
      ) {
        newObj[key] = deepMergeDefinitions(defObj[key], defOtherObj[key]);
      } else {
        console.warn(
          `could not merge ${key} because its types diverges, defaulting to target.`
        );
        newObj[key] = defOtherObj[key];
      }
    }
  }
  return newObj;
};
