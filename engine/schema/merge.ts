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
