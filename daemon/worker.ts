import { type Context, Hono, type Next } from "@hono/hono";
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

const wp = Promise.withResolvers<DenoRun>();

export const worker = async () => {
  const startTs = performance.now();
  console.log("[worker] awaiting wp.promise");
  const w = await wp.promise;

  console.log("[worker] wp.promise resolved; starting isolate");
  w.start();
  console.log("[worker] waiting until isolate is ready (port listening)");
  await w.waitUntilReady();

  console.log(
    `[worker] isolate ready after ${
      (performance.now() - startTs).toFixed(0)
    }ms`,
  );
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

  // Initialize worker with initial options
  const initializeWorker = async () => {
    try {
      console.log("[worker] initializing worker options...");
      const initialOpts = await resolveWorkerOptions(optionsProvider);
      console.log(
        `[worker] resolved worker options; creating DenoRun(port=${initialOpts.port})`,
      );
      wp.resolve(new DenoRun(initialOpts));
      console.log("[worker] wp.resolve(DenoRun) complete");
    } catch (error) {
      console.error("[worker] failed to initialize worker options", error);
      // Prevent hard hangs on await wp.promise.
      wp.reject(error);
    }
  };

  console.log("[worker] initializing worker");
  initializeWorker();

  // ensure isolate is up and running
  app.use("/*", async (c: Context, next: Next) => {
    try {
      await worker();
      await next();
    } catch (error) {
      console.error(error);

      c.res = new Response(`Error while starting worker`, { status: 424 });
    }
  });

  app.all("/*", (c: Context) => wp.promise.then((w) => w.fetch(c.req.raw)));

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
