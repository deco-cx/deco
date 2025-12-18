import { fromFileUrl, SEPARATOR } from "../compat/std-path.ts";
export { exists } from "../compat/std-fs.ts";

export const fileSeparatorToSlash = (path: string) => {
  return path.replaceAll(SEPARATOR, "/");
};

export const fromFileUrlOrNoop = (urlString: string): string => {
  const url = new URL(urlString);
  if (url.protocol === "file:") {
    return fileSeparatorToSlash(fromFileUrl(urlString));
  }
  return urlString;
};
