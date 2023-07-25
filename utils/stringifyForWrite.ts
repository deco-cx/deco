export default function stringifyForWrite(
  object: Object,
): string {
  return `${JSON.stringify(object, null, 2)}\n`;
}
