import {
  isResolvable,
  Resolvable,
  ResolveChain,
} from "$live/engine/core/resolver.ts";

export type Hint = ResolveChain;
export type ResolveHints = Record<string, Hint[]>;
const traverseObject = (
  // deno-lint-ignore ban-types
  obj: object,
  maybeHint?: Hint,
): Hint[] => {
  const hints = [];
  for (const [key, value] of Object.entries(obj)) {
    hints.push(
      ...traverseAny(value, [...(maybeHint ?? []), {
        type: "prop",
        value: key,
      }]),
    );
  }
  return hints;
};

const traverseArray = (arr: unknown[], hint: Hint): Hint[] => {
  const hints = [];
  for (let index = 0; index < arr.length; index++) {
    hints.push(
      ...traverseAny(arr[index], [...hint, { type: "prop", value: index }]),
    );
  }
  return hints;
};

const traverseAny = (
  value: unknown,
  hint: Hint,
): Hint[] => {
  const hints = isResolvable(value)
    ? [[...hint, {
      type: // TODO (mcandeia) dumb way of doing this, this can be done by checking the resolver/resolvable map, improve this later.
        !value.__resolveType.includes("routes") &&
          (value.__resolveType.endsWith(".ts") ||
            value.__resolveType.endsWith(".tsx"))
          ? "resolver" as const
          : "resolvable" as const,
      value: value.__resolveType,
    }]]
    : [];
  if (Array.isArray(value)) {
    return [...traverseArray(value, hint), ...hints];
  }
  if (value && typeof value === "object") {
    return [...traverseObject(value, hint), ...hints];
  }
  return hints;
};

const traverse = (
  hints: ResolveHints,
  [id, resolvable]: [string, Resolvable],
): ResolveHints => {
  return { ...hints, [id]: traverseObject(resolvable) };
};

/**
 * Generate resolvable hints for a given resolvable.
 * hints are useful to rapid resolve any resolvable by just accessing its properties.
 * @param resolvableMap the entire resolvable map
 * @returns the hints
 */
export const genHints = (
  resolvableMap: Record<string, Resolvable>,
): ResolveHints => {
  return Object.entries(resolvableMap).reduce(traverse, {});
};
