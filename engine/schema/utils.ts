/**
 * Some attriibutes are not string in JSON Schema. Because of that, we need to parse some to boolean or number.
 * For instance, maxLength and maxItems have to be parsed to number. readOnly should be a boolean etc
 */
export const parseJSDocAttribute = (key: string, value: string) => {
  switch (key) {
    case "examples":
      return value.split("\n").map((example) => example.trim());
    case "maximum":
    case "exclusiveMaximum":
    case "minimum":
    case "exclusiveMinimum":
    case "maxLength":
    case "minLength":
    case "multipleOf":
    case "maxItems":
    case "minItems":
    case "maxProperties":
    case "minProperties":
      return Number(value);
    case "readOnly":
    case "writeOnly":
    case "ignore":
      return true;
    case "deprecated":
    case "uniqueItems":
      return Boolean(value);
    case "default":
      switch (value) {
        case "true":
          return true;
        case "false":
          return false;
        case "null":
          return null;
        default:
          return !Number.isNaN(+value) ? +value : value;
      }
    default:
      return value;
  }
};

/**
 * Transforms myPropName into "My Prop Name" for cases
 * when there's no label specified
 *
 * TODO: Support i18n in the future
 */
export const beautify = (propName: string) => {
  return (
    propName
      // insert a space before all caps
      .replace(/([A-Z])/g, " $1")
      // uppercase the first character
      .replace(/^./, function (str) {
        return str.toUpperCase();
      })
      // Remove startsWith("/"")
      .replace(/^\//, "")
      // Remove endsdWith('.ts' or '.tsx')
      .replace(/\.tsx?$/, "")
  );
};

export interface TypedElement {
  type: string;
}
export type Visitor<T extends TypedElement, TResult = void> = {
  [K in T["type"]]?: (t: Extract<T, { type: K }>) => TResult | void;
};

export function visitSync<T extends TypedElement, TResult = void>(
  items: T[],
  visitor: Visitor<T, TResult>,
): TResult | void {
  for (const item of items) {
    const visitFunc = visitor[item.type as keyof Visitor<T>];
    // deno-lint-ignore no-explicit-any
    const result = visitFunc?.(item as any);
    if (result) {
      return result;
    }
  }
}

export async function visit<T extends TypedElement, TResult = void>(
  items: T[],
  visitor: Visitor<T, TResult>,
): Promise<TResult | void> {
  for (const item of items) {
    const visitFunc = visitor[item.type as keyof Visitor<T>];
    // deno-lint-ignore no-explicit-any
    const result = await visitFunc?.(item as any);
    if (result) {
      return result;
    }
  }
}
