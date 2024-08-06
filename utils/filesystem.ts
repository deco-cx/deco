import { fromFileUrl, join } from "@std/path";

export { exists } from "@std/fs";

export const resolveFilePath = (path: string) => {
  return join(
    Deno.cwd(),
    "..",
    path,
  );
};

export const fileSeparatorToSlash = (path: string) => {
  return path.replaceAll("\\", "/");
};

export const fromFileUrlOrNoop = (urlString: string): string => {
  const url = new URL(urlString);
  if (url.protocol === "file:") {
    return fileSeparatorToSlash(fromFileUrl(urlString));
  }
  return urlString;
};
