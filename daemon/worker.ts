import { Hono } from "@hono/hono";
import { broadcast } from "./sse/channel.ts";
import { DenoRun } from "./workers/denoRun.ts";

export interface WorkerOptions {
  persist: () => void;
  command: Deno.Command;
  port: number;
}

export type WorkerOptionsProvider =
  | WorkerOptions
  | (() => Promise<WorkerOptions>);

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

const makeWp = () => {
  const w = Promise.withResolvers<DenoRun>();
  // Prevent unhandled rejection crash if worker fails to initialize (e.g. no dev.ts).
  // The rejection is handled by worker() callers via the middleware.
  w.promise.catch(() => {});
  return w;
};

let wp = makeWp();

// Set to true when worker initialization fails permanently (e.g. no dev.ts).
// Used by watchMeta to exit its retry loop.
let workerInitFailed = false;
export const isWorkerDisabled = () => workerInitFailed;

// Reset worker state on undeploy so a subsequent deploy starts fresh.
// Must recreate wp because a settled (resolved/rejected) Promise cannot be reused.
export const resetWorkerState = () => {
  workerInitFailed = false;
  wp = makeWp();
};

export const worker = async () => {
  const w = await wp.promise;

  w.start();
  await w.waitUntilReady();

  return w;
};

const isProviderFn = (provider: unknown): provider is () => unknown =>
  typeof provider === "function";

const resolveWorkerOptions = async <
  T extends WorkerOptions,
>(
  provider: T | (() => Promise<T>),
): Promise<T> => {
  if (isProviderFn(provider)) {
    return await provider();
  }
  return provider;
};

export const createWorker = (optionsProvider: WorkerOptionsProvider) => {
  const app = new Hono();

  // Initialize worker with initial options.
  // Rejects wp if options cannot be resolved (e.g. no dev.ts in repo)
  // so that worker() rejects and the middleware returns 424 instead of hanging.
  const initializeWorker = async () => {
    try {
      const initialOpts = await resolveWorkerOptions(optionsProvider);
      wp.resolve(new DenoRun(initialOpts));
    } catch (err) {
      workerInitFailed = true;
      wp.reject(err);
    }
  };

  initializeWorker();

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
      Deno.addSignalListener(signal, async () => {
        console.log(`Received ${signal}`);

        try {
          const opts = await resolveWorkerOptions(optionsProvider);
          opts.persist();
        } catch (error) {
          console.error("Error calling persist during shutdown:", error);
        }

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
