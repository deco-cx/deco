import type { MiddlewareHandler } from "$fresh/server.ts";
import { Daemon } from "../../../daemon/daemon.ts";
import type { Isolate } from "../../../daemon/workers/isolate.ts";

const decod = new Daemon();
export const handler: MiddlewareHandler = (req, ctx) => {
  const isolate: Isolate = {
    fetch: () => {
      return ctx.next();
    },
  };

  return decod.fetch(req, isolate);
};
