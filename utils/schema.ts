import type { JSONSchema7 } from "json-schema";

export const propertyHasRef = (
  schema: JSONSchema7 | undefined,
  propKey: string,
) => {
  // Property is undefined | boolean | object, so if property[key] is === "object" and $ref in property[key]
  return (typeof schema?.properties?.[propKey]) === "object" &&
    "$ref" in (schema?.properties?.[propKey] as JSONSchema7);
};