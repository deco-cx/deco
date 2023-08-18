import {
  isResolvable,
  isResolved,
  Resolvable,
} from "../../engine/core/resolver.ts";

export type HintNode<T> = {
  [key in keyof T]?: HintNode<T[key]> | null;
};

// deno-lint-ignore no-explicit-any
export type ResolveHints = Record<string, HintNode<any> | null>;
// deno-lint-ignore no-explicit-any
const traverseObject = <T extends Record<string, any>>(
  obj: T,
): HintNode<T> | null => {
  let node: HintNode<T> | null = null;
  for (const [key, value] of Object.entries(obj)) {
    const innerNode = traverseAny(value);
    if (innerNode) {
      node ??= {};
      node[key as keyof T] = innerNode;
    }
  }
  return node;
};

const traverseArray = <T extends unknown[]>(
  arr: unknown[],
): HintNode<T> | null => {
  let node: HintNode<T> | null = null;
  for (let index = 0; index < arr.length; index++) {
    const hintNode = traverseAny(arr[index]);
    if (hintNode !== null) {
      node ??= {};
      node[index] = hintNode;
    }
  }
  return node;
};

export const traverseAny = <T>(
  value: unknown,
): HintNode<T> | null => {
  if (isResolved(value)) {
    return {};
  }
  const node = isResolvable(value) ? {} : null;
  if (Array.isArray(value)) {
    return traverseArray(value) ?? node;
  }
  if (value && typeof value === "object") {
    return traverseObject(value) ?? node;
  }
  return node;
};

const traverse = (
  hints: ResolveHints,
  [id, resolvable]: [string, Resolvable],
): ResolveHints => {
  hints[id] = traverseObject(resolvable) ?? {};
  return hints;
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
  return Object.entries(resolvableMap).reduce(
    traverse,
    {},
  );
};
