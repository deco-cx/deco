// deno-lint-ignore-file ban-types no-explicit-any
export type DotPrefix<T extends string> = T extends "" ? "" : `.${T}`;

export type DotNestedKeys<T> = (T extends object ? {
    [K in Exclude<keyof T, symbol>]: T[K] extends Function ? never
      : T[K] extends any[]
        ? `${K}` | `${K}${DotPrefix<DotNestedKeys<T[K][number]>>}`
      : (`${K}` | `${K}${DotPrefix<DotNestedKeys<T[K]>>}`);
  }[Exclude<keyof T, symbol>]
  : "") extends infer D ? Extract<D, string> : never;

export const pickPath = <T>(
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

export type PickPath<T, Path extends DotNestedKeys<T>> = Path extends keyof T
  ? { [key in keyof T & Path]: T[Path] }
  : Path extends `${infer first}.${infer rest}`
    ? first extends keyof T
      ? rest extends DotNestedKeys<T[first]>
        ? { [k in keyof T & first]: PickPath<T[k], rest> }
      : never
    : never
  : never;

export const pickPaths = <T, K extends DotNestedKeys<T>>(
  obj: T,
  keys: K[],
): PickPath<T, K> => {
  const newObj: Partial<T> | Array<any> = Array.isArray(obj)
    ? new Array(obj.length)
    : {};
  for (const k of keys) {
    pickPath(obj, newObj as Partial<T>, (k as string).split("."));
  }

  return newObj as unknown as PickPath<T, K>;
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
