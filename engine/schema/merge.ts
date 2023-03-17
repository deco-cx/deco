import { JSONSchema7 } from "$live/deps.ts";

export const mergeJSONSchemas = (
  defObj: JSONSchema7,
  defOtherObj: JSONSchema7,
) => {
  const bothNonUndefined = defObj && defOtherObj;
  if (!bothNonUndefined) {
    return defObj ?? defOtherObj;
  }

  const anyOf: JSONSchema7[] = [];
  if (defObj.anyOf && defObj.anyOf.length > 0) {
    anyOf.push(...(defObj.anyOf as JSONSchema7[]));
  } else {
    anyOf.push(defObj);
  }

  if (defOtherObj.anyOf && defOtherObj.anyOf.length > 0) {
    anyOf.push(...(defOtherObj.anyOf as JSONSchema7[]));
  } else {
    anyOf.push(defOtherObj);
  }

  const alreadyAdded: Record<string, boolean> = {};

  return {
    anyOf: anyOf.filter((ref) => {
      if (!ref.$id) {
        return true;
      }
      const added = alreadyAdded[ref.$id];
      alreadyAdded[ref.$id] = true;
      return !added;
    }),
    $id: defObj.$id ?? defOtherObj.$id,
  };
};
const isJSONSchema = <T>(s: T | JSONSchema7): s is JSONSchema7 => {
  return (
    (s as JSONSchema7)?.type !== undefined ||
    (s as JSONSchema7)?.$ref !== undefined ||
    (s as JSONSchema7)?.$id !== undefined ||
    (s as JSONSchema7)?.anyOf !== undefined
  );
};
export const deepMergeDefinitions = (
  def: Record<string, JSONSchema7>,
  defOther: Record<string, JSONSchema7>,
): Record<string, JSONSchema7> => {
  const newObj: Record<string, JSONSchema7> = {};
  for (
    const key of new Set([
      ...Object.keys(def ?? {}),
      ...Object.keys(defOther ?? {}),
    ])
  ) {
    if (!def[key]) {
      newObj[key] = defOther[key];
    } else if (!defOther[key]) {
      newObj[key] = def[key];
    } else {
      const defObj = def[key];
      const defOtherObj = defOther[key];
      if (isJSONSchema(defObj) && isJSONSchema(defOtherObj)) {
        newObj[key] = mergeJSONSchemas(defObj, defOtherObj);
      } else if (
        typeof defObj === "object" &&
        typeof defOtherObj === "object"
      ) {
        newObj[key] = deepMergeDefinitions(
          defObj as Record<string, JSONSchema7>,
          defOtherObj as Record<string, JSONSchema7>,
        );
      } else {
        console.warn(
          `could not merge ${key} because its types diverges, defaulting to target.`,
        );
        newObj[key] = defOtherObj;
      }
    }
  }
  return newObj;
};
