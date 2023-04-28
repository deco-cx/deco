export type PromiseOrValue<T> = Promise<T> | T;
export type Entries<T> = {
  [K in keyof T]: [K, T[K]];
}[keyof T][];

export type UnPromisify<T> = T extends Promise<infer U> ? U : T;

export function isAwaitable<T>(v: T | Promise<T>): v is Promise<T> {
  return (v as Promise<T>)?.then !== undefined &&
    (v as Promise<T>)?.then !== null;
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

export const notUndefined = <T>(
  v: T | undefined | null | Awaited<T>,
): v is T => {
  return v !== undefined && v !== null;
};

export const isPrimitive = <T>(v: T): boolean => {
  return !Array.isArray(v) && typeof v !== "object" && typeof v !== "function";
};

interface SingleFlight<T> {
  do: (key: string, f: () => Promise<T>) => Promise<T>;
}

export const singleFlight = <T>(): SingleFlight<T> => {
  const active: Record<string, Promise<T>> = {};
  return {
    do: (key: string, f: () => Promise<T>) => {
      const promise = active[key];
      if (promise !== undefined) {
        return promise;
      }
      active[key] = f().finally(() => delete active[key]);
      return active[key];
    },
  };
};
