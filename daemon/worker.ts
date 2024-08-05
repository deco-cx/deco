import { Hono } from "./deps.ts";
import { DenoRun } from "./workers/denoRun.ts";

export interface WorkerOptions {
  command: Deno.Command;
  port: number;
}

let started = false;
const startLogStream = async (worker: DenoRun) => {
  if (started) {
    return;
  }
  started = true;
  for await (const log of worker.logs?.() ?? []) {
    const message = log.message.slice(0, -1);
    if (log.level === "error") {
      console.error(message);
    } else {
      console.log(message);
    }
  }
};

const ensureWorkerHasStarted = (worker: DenoRun) => {
  if (worker.isRunning() === false) {
    worker.start();
    startLogStream(worker);
    return worker.waitUntilReady();
  }
};

export const createWorker = (opts: WorkerOptions) => {
  const worker = new DenoRun(opts);
  const app = new Hono.Hono();

  // ensure isolate is up and running
  app.use("/*", async (_c, next) => {
    await ensureWorkerHasStarted(worker);
    await next();
  });

  app.all("/*", (c) => worker.fetch(c.req.raw));

  // listen for signals
  const signals: Deno.Signal[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    Deno.addSignalListener(signal, () => {
      console.log(`Received ${signal}`);
      worker.signal(signal);
      worker[Symbol.asyncDispose]();
      self.close();
    });
  }

  ensureWorkerHasStarted(worker);

  return { app, worker };
};
