// Avoid throwing DOM Exception:
// The string to be encoded contains characters outside of the Latin1 range.
const btoaSafe = (x: string) =>
  btoa(`decodeURIComponent(escape(${unescape(encodeURIComponent(x))}))`);

// deno-lint-ignore no-explicit-any
export const scriptAsDataURI = <T extends (...args: any[]) => any>(
  fn: T,
  ...params: Parameters<T>
) =>
  dataURI(
    "text/javascript",
    true,
    `(${fn})(${params.map((p) => JSON.stringify(p)).join(", ")})`,
  );

export const dataURI = (
  contentType: "text/javascript",
  base64: boolean,
  content: string,
) => `data:${contentType}${base64 ? `;base64,${btoaSafe(content)}` : content}`;
