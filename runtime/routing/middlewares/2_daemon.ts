import { context, DaemonMode } from "deco/deco.ts";
import { Daemon, DENO_FS_APIS } from "../../../daemon/daemon.ts";
import type { Isolate } from "../../../daemon/workers/isolate.ts";
import { createMiddleware } from "../middleware.ts";

const decod = context.decodMode === DaemonMode.Embedded
  ? new Daemon({
    fsApi: { ...DENO_FS_APIS, writeTextFile: async () => {} }, // read-only environment
  })
  : undefined;
export const handler = createMiddleware((ctx) => {
  if (!decod) {
    return ctx.next();
  }
  const isolate: Isolate = {
    fetch: () => {
      return ctx.next();
    },
  };

  return decod.fetch(ctx.req, isolate);
});
