import { ZodFirstPartyTypeKind, ZodObject } from "zod";

type Def = { defaultValue?: () => any; value?: any };

// Extract this to a library further
// https://github.com/StefanTerdell/zod-to-json-schema/tree/07e83e48a43879dc0e75d4ac0f0609584cac92f4/src/parsers
// https://github.com/anatine/zod-plugins/blob/24d2ee5f1916fad3a8a6859038b0d3f4863432fb/packages/zod-mock/
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
