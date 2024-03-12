import { fromFileUrl, join, SEP } from "std/path/mod.ts";
export { exists } from "std/fs/mod.ts";

export const resolveFilePath = (path: string) => {
  return join(
    Deno.cwd(),
    "..",
    path,
  );
};

export const fileSeparatorToSlash = (path: string) => {
  return path.replaceAll(SEP, "/");
};

export const fromFileUrlOrNoop = (urlString: string): string => {
  const url = new URL(urlString);
  if (url.protocol === "file:") {
    return fileSeparatorToSlash(fromFileUrl(urlString));
  }
  return urlString;
};
