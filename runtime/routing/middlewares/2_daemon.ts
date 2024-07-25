import { Daemon, DENO_FS_APIS } from "../../../daemon/daemon.ts";
import type { Isolate } from "../../../daemon/workers/isolate.ts";
import { context, DaemonMode } from "../../../deco.ts";
import { createMiddleware } from "../middleware.ts";

const decod = context.decodMode === DaemonMode.Embedded
  ? new Daemon({
    fsApi: { ...DENO_FS_APIS, writeTextFile: async () => {} }, // read-only environment
  })
  : undefined;
export const handler = createMiddleware((ctx, next) => {
  if (!decod) {
    return next();
  }
  const isolate: Isolate = {
    fetch: async () => {
      await next();
      return ctx.res;
    },
  };

  return decod.fetch(ctx.req.raw, isolate);
});
