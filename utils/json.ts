export function stringifyForWrite(
  object: object,
): string {
  return `${JSON.stringify(object, null, 2)}\n`;
}
