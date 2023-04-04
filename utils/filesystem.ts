import { context } from "$live/live.ts";

import { fromFileUrl, join } from "https://deno.land/std@0.147.0/path/mod.ts";

export const resolveFilePath = (path: string) => {
  return join(fromFileUrl(context.manifest?.baseUrl ?? ""), "..", path);
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
