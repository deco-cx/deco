/** Monkey patch fetch */

import { createFetch as withCache } from "./fetch_cache.ts";
import { createFetch as withLogs } from "./fetch_log.ts";

globalThis.fetch = [
  withCache,
  withLogs,
].reduce((acc, curr) => curr(acc), globalThis.fetch);
