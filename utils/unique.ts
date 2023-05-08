export const unique = <T>(array: T[]) => Array.from(new Set(array));

export function uniqBy<T>(a: T[], key: keyof T) {
  const seen: Map<T[keyof T], boolean> = new Map();
  return a.filter(function (item) {
    const value = item[key];
    return seen.has(value) ? false : (seen.set(value, true));
  });
}
