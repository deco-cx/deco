// deno-lint-ignore-file ban-types no-explicit-any
import { UnionToIntersection } from "../deps.ts";

export type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;

// truncate on a given Count to avoid recursive types
type DotNestedKeysTruncate<T, Count extends number, Acc extends 0[] = []> =
  Acc["length"] extends Count ? ""
    : (T extends object ? {
        [K in Exclude<keyof T, symbol>]: T[K] extends Function ? never
          : Required<T>[K] extends any[] ?
              | `${K}`
              | `${K}${DotPrefix<
                DotNestedKeysTruncate<
                  Required<T>[K][number],
                  Count,
                  [0, ...Acc]
                >
              >}`
          : (
            | `${K}`
            | `${K}${DotPrefix<
              DotNestedKeysTruncate<T[K], Count, [0, ...Acc]>
            >}`
          );
      }[Exclude<keyof T, symbol>]
      : "") extends infer D ? Extract<D, string>
    : never;

export type DotNestedKeys<T> = NonNullable<T> extends (infer TE)[]
  ? DotNestedKeysTruncate<TE, 6>
  : DotNestedKeysTruncate<T, 6>;

const pickPath = <T>(
  obj: T,
  current: Partial<T> | Array<any>,
  keys: string[],
) => {
  if (Array.isArray(obj)) {
    let idx = 0;
    for (const value of obj as Array<any>) {
      const cAsArray = current as Array<any>;
      cAsArray[idx] ??= Array.isArray(value) ? new Array(value.length) : {};
      pickPath(value, cAsArray[idx], keys);
      idx++;
    }
    return;
  }

  const [first, ...rest] = keys as [keyof T, ...string[]];
  if (keys.length === 1) {
    (current as Partial<T>)[first] = obj[first];
    return;
  }
  const c = current as Record<keyof T, {}>;
  if (Array.isArray(obj[first])) {
    c[first] ??= new Array((obj[first] as Array<any>).length);
    let idx = 0;
    for (const value of (obj[first] as Array<any>)) {
      const cAsArray = c[first] as Array<any>;
      cAsArray[idx] ??= {};
      pickPath(value, cAsArray[idx], rest);
      idx++;
    }
    return;
  }
  c[first] ??= {};
  pickPath(obj[first], c[first], rest);
};

export type DeepPick<
  T,
  Path extends DotNestedKeys<T>,
> = T extends null ? never : UnionToIntersection<
  T extends (infer TE)[]
    ? Path extends DotNestedKeys<TE> ? DeepPick<TE, Path>[] : never
    : Path extends keyof T ? { [key in Path]: T[key] }
    : Path extends `${infer first}.${infer rest}`
      ? first extends keyof T
        ? rest extends DotNestedKeys<T[first]>
          ? { [k in first]: DeepPick<Required<T>[k], rest> }
        : Required<T>[first] extends (infer E1)[]
          ? rest extends DotNestedKeys<E1> ? {
              [k in first]: Required<T>[k] extends any[]
                ? DeepPick<Required<E1>, rest>
                : never;
            }
          : never
        : never
      : never
    : never
>;

/**
 * pick paths based on specified @param paths
 * @param obj the object that should be picked
 * @param paths the paths in the dot notation format e.g `a.b.c.d`, notice that for arrays the index is omitted and the key is selected for each element.
 * @returns the modified object.
 */
export const pickPaths = <T, K extends DotNestedKeys<T>>(
  obj: T,
  paths: K[],
): DeepPick<T, K> => {
  const newObj: Partial<T> | Array<any> = Array.isArray(obj)
    ? new Array(obj.length)
    : {};
  for (const path of paths) {
    pickPath(obj, newObj as Partial<T>, (path as string).split("."));
  }

  return newObj as unknown as DeepPick<T, K>;
};

const isNumber = new RegExp("/^-?\d+\.?\d*$/");
/**
 * Builds an object based on a list of key/value pairs.
 */
export const buildObj = (
  partial: Record<string, any>,
  [keys, value]: [string[], string],
) => {
  const [first, ...rest] = keys;
  let key: string | number = first;
  if (first.endsWith("]")) {
    const [arrKey, idx] = first.split("[");
    partial[arrKey] ??= [];
    const idxNumber = +idx.substring(0, idx.length - 1);
    rest.unshift(idxNumber.toString());
    key = arrKey;
  } else {
    partial[first] ??= {};
  }
  if (rest.length === 0) {
    partial[key] = isNumber.test(value) ? +value : value;
    return;
  }
  buildObj(partial[key], [rest, value]);
};

export const identity = <T>(value: T): T => value;

export const tryOrDefault = <R>(fn: () => R, defaultValue: R) => {
  try {
    return fn();
  } catch {
    return defaultValue;
  }
};
