export type PromiseOrValue<T> = Promise<T> | T;
export type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export type SameKeys<T> = {
  [key in keyof T]: unknown;
};

export function isAwaitable<T>(v: T | Promise<T>): v is Promise<T> {
  return (v as Promise<T>).then !== undefined;
}

export const mapObjKeys = <T, R>(
  obj: T,
  // deno-lint-ignore no-explicit-any
  mapper: (value: T[keyof T], key: keyof T) => any,
): R => {
  const entries = Object.entries(obj ?? {}) as Entries<T>;

  const keyValues = entries.map(([key, value]) => {
    return [key, mapper(value, key)];
  });

  return keyValues.reduce((acc, [key, value]) => {
    return { ...acc, [key]: value };
  }, {} as R);
};

export type Promisified<T> = {
  [key in keyof T]: Promise<T[key]>;
};

export const waitKeys = async <T>(p: Promisified<T>): Promise<T> => {
  const entries = Object.entries(p) as Entries<Promisified<T>>;

  const keyResults = await Promise.all(
    entries.map(([k, v]) => v.then((r) => [k, r] as [keyof T, T[keyof T]])),
  );

  return keyResults.reduce((obj, [key, value]) => {
    return { ...obj, [key]: value };
  }, {} as T);
};

export const notUndefined = <T>(v: T | undefined | Awaited<T>): v is T => {
  return v !== undefined;
};

export const isPrimitive = <T>(v: T): boolean => {
  return !Array.isArray(v) && typeof v !== "object" && typeof v !== "function";
};
