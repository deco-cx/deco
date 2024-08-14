import { Hono } from "@hono/hono";
import { DenoRun } from "./workers/denoRun.ts";

export interface WorkerOptions {
  persist: () => void;
  command: Deno.Command;
  port: number;
}

export let worker: DenoRun | null = null;

export const createWorker = (opts: WorkerOptions) => {
  const app = new Hono();
  const w = new DenoRun(opts);
  let ok: Promise<unknown> | null = null;

  worker = w;

  const startWorker = async (worker: DenoRun) => {
    worker.start();
    await worker.waitUntilReady();
  };

  // ensure isolate is up and running
  app.use("/*", async (c, next) => {
    try {
      ok ||= startWorker(w);

      await ok.then(next);
    } catch (error) {
      console.error(error);

      ok = null;
      c.res = new Response(`Error while starting worker`, { status: 424 });
    }
  });

  app.all("/*", (c) => w.fetch(c.req.raw));

  // listen for signals
  const signals: Deno.Signal[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    Deno.addSignalListener(signal, () => {
      console.log(`Received ${signal}`);
      opts.persist();
      w.signal(signal);
      w[Symbol.asyncDispose]();
      self.close();
    });
  }

  return app;
};
