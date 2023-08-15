import {
  JsDoc,
  JsDocTag,
  JsDocTagValued,
} from "https://deno.land/x/deno_doc@0.59.0/lib/types.d.ts";

/**
 * Some attriibutes are not string in JSON Schema. Because of that, we need to parse some to boolean or number.
 * For instance, maxLength and maxItems have to be parsed to number. readOnly should be a boolean etc
 */
export const parseJSDocAttribute = (key: string, value: string) => {
  switch (key) {
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
    case "uniqueItems":
      return Boolean(value);
    default:
      return value;
  }
};

export const jsDocToSchema = (node: JsDoc) =>
  node.tags
    ? Object.fromEntries(
      node.tags
        .map((tag: JsDocTag) => {
          if (tag.kind === "deprecated") {
            return ["deprecated", true] as const;
          }

          const match = (tag as JsDocTagValued).value?.match(
            /^@(?<key>[a-zA-Z$]+) (?<value>.*)$/,
          );

          const key = match?.groups?.key;
          const value = match?.groups?.value;

          if (typeof key === "string" && typeof value === "string") {
            const parsedValue = parseJSDocAttribute(key, value);
            return [key, parsedValue] as const;
          }

          return null;
        })
        .filter((e): e is [string, string | number | boolean] => !!e),
    )
    : undefined;

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

export const exec = async (cmd: string[]) => {
  const process = Deno.run({ cmd, stdout: "piped", stderr: "piped" });

  const [stdout, status] = await Promise.all([
    process.output(),
    process.status(),
  ]);
  process.close();
  process.stderr.close();

  if (!status.success) {
    throw new Error(
      `Error while running ${cmd.join(" ")} with status ${status.code}`,
    );
  }

  return new TextDecoder().decode(stdout);
};
