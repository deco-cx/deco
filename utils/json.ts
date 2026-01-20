export function stringifyForWrite(
  object: object,
): string {
  return `${JSON.stringify(object, null, 2)}\n`;
}

/**
 * Stable JSON stringification that sorts object keys recursively.
 * This ensures the same object structure always produces the same string,
 * regardless of property insertion order.
 */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map((item) => stableStringify(item)).join(",") + "]";
  }

  const sortedKeys = Object.keys(value).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (value as Record<string, unknown>)[key];
    return JSON.stringify(key) + ":" + stableStringify(val);
  });

  return "{" + pairs.join(",") + "}";
}
