import { ZodFirstPartyTypeKind, ZodObject } from "zod";

type Def = { defaultValue?: () => any; value?: any };

const zodTypeKindParser: Record<
  ZodFirstPartyTypeKind,
  (
    def: Def,
    typename: ZodFirstPartyTypeKind,
  ) => any
> = {
  ZodDefault: (def) => {
    return def.defaultValue?.();
  },
  ZodBoolean: (def) => {
    return false;
  },
  ZodNumber: (def) => {
    return 0;
  },
  ZodLiteral: (def) => {
    return def.value;
  },
  ZodString: (def) => {
    return "";
  },
};

function parseDef(
  def: Def,
  typename: ZodFirstPartyTypeKind,
) {
  return zodTypeKindParser[typename]?.(def, typename) ?? "";
}

export function generateObjectFromShape(shape: ZodObject<any>) {
  const res = {};
  Object.keys(shape).forEach((key) => {
    if (shape[key].shape) {
      res[key] = generateObjectFromShape(shape[key].shape);
      return;
    }

    const shapeDef = shape[key]._def;
    res[key] = parseDef(shapeDef, shapeDef.typeName);
  });

  return res;
}
