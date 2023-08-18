import { bgBrightRed, brightYellow } from "std/fmt/colors.ts";
import { Resolvable, ResolverMap } from "../engine/core/resolver.ts";

const integrityCheckRec = (
  resolvers: ResolverMap,
  resolvables: Record<string, Resolvable>,
  obj: Record<string, Resolvable>,
  key?: string,
) => {
  if (!obj) {
    return;
  }
  if (Array.isArray(obj)) {
    for (const curr of obj) {
      integrityCheckRec(resolvers, resolvables, curr, key);
    }
  }
  if (!Array.isArray(obj) && typeof obj === "object") {
    const { __resolveType, ...rest } = obj;
    if (
      __resolveType && !resolvers[__resolveType] && !resolvables[__resolveType]
    ) {
      console.warn(
        `${brightYellow("warn")}: missing required module ${
          bgBrightRed(__resolveType)
        }, block id: ${brightYellow(key!)}.`,
      );
    }
    for (const [k, value] of Object.entries(rest)) {
      integrityCheckRec(resolvers, resolvables, value, key ?? k);
    }
  }
};

export const integrityCheck = (
  resolvers: ResolverMap,
  resolvables: Record<string, Resolvable>,
) => {
  integrityCheckRec(resolvers, resolvables, resolvables);
};
