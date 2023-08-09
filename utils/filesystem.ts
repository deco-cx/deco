import { context } from "$live/live.ts";

import { DecoManifest } from "$live/mod.ts";
import {
  fromFileUrl,
  join,
  sep,
} from "https://deno.land/std@0.147.0/path/mod.ts";

export const resolveFilePath = (path: string) => {
  return join(
    fromFileUrl((context.manifest as DecoManifest)?.baseUrl ?? ""),
    "..",
    path,
  );
};

export const exists = async (dir: string): Promise<boolean> => {
  try {
    await Deno.stat(dir);
    // successful, file or directory must exist
    return true;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // file or directory does not exist
      return false;
    } else {
      // unexpected error, maybe permissions, pass it along
      throw error;
    }
  }
};

export const fileSeparatorToSlash = (path: string) => {
  return path.replaceAll(sep, "/");
};

export const fromFileUrlOrNoop = (urlString: string): string => {
  const url = new URL(urlString);
  if (url.protocol === "file:") {
    return fileSeparatorToSlash(fromFileUrl(urlString));
  }
  return urlString;
};
