import { Hono } from "@hono/hono";
import { broadcast } from "./sse/channel.ts";
import { DenoRun } from "./workers/denoRun.ts";

export interface WorkerOptions {
  persist: () => void;
  command: Deno.Command;
  port: number;
}

export type WorkerStatusEvent = {
  type: "worker-status";
  detail: WorkerStatus;
};

export type WorkerStatus = { state: "updating" | "ready" };

const workerState: WorkerStatus = { state: "updating" };

export const dispatchWorkerState = (state: "ready" | "updating") => {
  workerState.state = state;
  broadcast({ type: "worker-status", detail: workerState });
};

export const start = (): WorkerStatusEvent => ({
  type: "worker-status",
  detail: workerState,
});

const wp = Promise.withResolvers<DenoRun>();

export const worker = async () => {
  const w = await wp.promise;

  w.start();
  await w.waitUntilReady();

  return w;
};

export const createWorker = (opts: WorkerOptions) => {
  const app = new Hono();

  wp.resolve(new DenoRun(opts));

  // ensure isolate is up and running
  app.use("/*", async (c, next) => {
    try {
      await worker();
      await next();
    } catch (error) {
      console.error(error);

      c.res = new Response(`Error while starting worker`, { status: 424 });
    }
  });

  app.all("/*", (c) => wp.promise.then((w) => w.fetch(c.req.raw)));

  // listen for signals
  const signals: Deno.Signal[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    try {
      Deno.addSignalListener(signal, () => {
        console.log(`Received ${signal}`);
        opts.persist();
        wp.promise.then((w) => {
          w.signal(signal);
          w[Symbol.asyncDispose]();
        });
        self.close();
      });
    } catch {
      /** Windows machines don't have sigterm */
    }
  }

  return app;
};
