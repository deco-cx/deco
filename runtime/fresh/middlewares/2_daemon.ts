import type { MiddlewareHandler } from "$fresh/server.ts";
import { context } from "deco/deco.ts";
import { Daemon } from "../../../daemon/daemon.ts";
import { KvFs } from "../../../daemon/realtime/kvfs.ts";
import type { Isolate } from "../../../daemon/workers/isolate.ts";

const decod = context.platform === "denodeploy" && !context.isPreview
  ? new Daemon({ fsApi: await KvFs.New(context.deploymentId!) })
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
