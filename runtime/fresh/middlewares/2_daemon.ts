import type { MiddlewareHandler } from "$fresh/server.ts";
import { context, DaemonMode } from "deco/deco.ts";
import { Daemon, DENO_FS_APIS } from "../../../daemon/daemon.ts";
import type { Isolate } from "../../../daemon/workers/isolate.ts";

const decod = context.decodMode === DaemonMode.Embedded
  ? new Daemon({
    fsApi: { ...DENO_FS_APIS, writeTextFile: async () => {} }, // read-only environment
  })
  : undefined;
export const handler: MiddlewareHandler = (req, ctx) => {
  if (!decod) {
    return ctx.next();
  }
  const isolate: Isolate = {
    fetch: () => {
      return ctx.next();
    },
  };

  return decod.fetch(req, isolate);
};
