import { isResolvable, Resolvable } from "$live/engine/core/resolver.ts";

export type Hint = (string | number)[];
export type ResolveHints = Record<string, Hint[]>;
const traverseObject = (
  // deno-lint-ignore ban-types
  obj: object,
  maybeHint?: Hint,
): Hint[] => {
  const hints = [];
  for (const [key, value] of Object.entries(obj)) {
    hints.push(...traverseAny(value, [...(maybeHint ?? []), key]));
  }
  return hints;
};

const traverseArray = (arr: unknown[], hint: Hint): Hint[] => {
  const hints = [];
  for (let index = 0; index < arr.length; index++) {
    hints.push(...traverseAny(arr[index], [...hint, index]));
  }
  return hints;
};

const traverseAny = (
  value: unknown,
  hint: Hint,
): Hint[] => {
  const hints = isResolvable(value) ? [hint] : [];
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
