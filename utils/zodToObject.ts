import { ZodObject } from "zod";

function getDefaultByZodTypename(typename: string) {
  switch (typename) {
    case "ZodBoolean":
      return false;
    case "ZodNumber":
      return 0;
    case "ZodLiteral":
    case "ZodString":
    default:
      return "";
  }
}

export function generateObjectFromShape(shape: ZodObject<any>) {
  const res = {};
  Object.keys(shape).forEach((key) => {
    if (shape[key].shape) {
      res[key] = generateObjectFromShape(shape[key].shape);
      return;
    }

    const shapeDef = shape[key]._def;

    if (shapeDef.defaultValue) {
      res[key] = shapeDef.defaultValue();
      return;
    }

    if (shapeDef.value) {
      res[key] = shapeDef.value;
      return;
    }

    res[key] = getDefaultByZodTypename(shape[key]._def.typeName);
  });

  return res;
}
