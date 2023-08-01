export interface SyncOnce<T> {
  do: (cb: () => Promise<T>) => Promise<T>;
}

/**
 * Run the function only once.
 * usage:
 * 
 * const runOnce = once<T>()
 * runOnce.do(() => new Date()) // this will return always the first value used.
 */
export const once = <T>(): SyncOnce<T> => {
  let result: Promise<T> | null = null;
  return {
    do: (cb: () => Promise<T>) => {
      return result ??= cb();
    },
  };
};
