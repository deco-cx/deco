import { fromFileUrl, SEPARATOR } from "@std/path";
export { exists } from "@std/fs";

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
