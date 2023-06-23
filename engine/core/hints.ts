import {
  FieldResolver,
  isResolvable,
  Resolvable,
  ResolveChain,
  ResolverMap,
} from "$live/engine/core/resolver.ts";

export type TypeOf = (resolveType: string) => FieldResolver["type"];
export type Hint = ResolveChain;
export type ResolveHints = Record<string, Hint[]>;
const traverseObject = (
  // deno-lint-ignore ban-types
  obj: object,
  typeOf: TypeOf,
  maybeHint?: Hint,
): Hint[] => {
  const hints = [];
  for (const [key, value] of Object.entries(obj)) {
    hints.push(
      ...traverseAny(value, typeOf, [...(maybeHint ?? []), {
        type: "prop",
        value: key,
      }]),
    );
  }
  return hints;
};

const traverseArray = (arr: unknown[], typeOf: TypeOf, hint: Hint): Hint[] => {
  const hints = [];
  for (let index = 0; index < arr.length; index++) {
    hints.push(
      ...traverseAny(arr[index], typeOf, [...hint, {
        type: "prop",
        value: index,
      }]),
    );
  }
  return hints;
};

export const traverseAny = (
  value: unknown,
  typeOf: TypeOf,
  maybeHint?: Hint,
): Hint[] => {
  const hint = maybeHint ?? [];
  const chainType = isResolvable(value) && typeOf(value.__resolveType);
  const hints = chainType
    ? [[...hint, {
      type: chainType,
      value: value.__resolveType,
    }]]
    : [];
  if (Array.isArray(value)) {
    return [...traverseArray(value, typeOf, hint), ...hints];
  }
  if (value && typeof value === "object") {
    return [...traverseObject(value, typeOf, hint), ...hints];
  }
  return hints;
};

const traverse = (typeOf: TypeOf) =>
(
  hints: ResolveHints,
  [id, resolvable]: [string, Resolvable],
): ResolveHints => {
  hints[id] = traverseObject(resolvable, typeOf);
  return hints;
};

export const typeOfFrom = (
  resolvableMap: Record<string, Resolvable>,
  resolverMap?: ResolverMap,
) =>
(resolveType: string) =>
  resolveType in (resolverMap ?? {})
    ? "resolver"
    : resolveType in resolvableMap
    ? "resolvable"
    : "dangling";
/**
 * Generate resolvable hints for a given resolvable.
 * hints are useful to rapid resolve any resolvable by just accessing its properties.
 * @param resolvableMap the entire resolvable map
 * @returns the hints
 */
export const genHints = (
  resolvableMap: Record<string, Resolvable>,
  resolverMap?: ResolverMap,
): ResolveHints => {
  return Object.entries(resolvableMap).reduce(
    traverse(typeOfFrom(resolvableMap, resolverMap)),
    {},
  );
};
