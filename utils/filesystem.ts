import { context } from "$live/server.ts";

import { join, fromFileUrl } from 'std/path/mod.ts'

export const resolveFilePath = (path: string) => {
  return join(fromFileUrl(context.manifest?.baseUrl ?? ""), '..', path)
}