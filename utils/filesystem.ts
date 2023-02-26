import { context } from "$live/live.ts";

import { fromFileUrl, join } from "https://deno.land/std@0.147.0/path/mod.ts";

export const resolveFilePath = (path: string) => {
  return join(fromFileUrl(context.manifest?.baseUrl ?? ""), "..", path);
};
