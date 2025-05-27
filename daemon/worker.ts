import { Hono } from "@hono/hono";
import { broadcast } from "./sse/channel.ts";
import { DenoRun } from "./workers/denoRun.ts";

export interface WorkerOptions {
  persist: () => void;
  command: Deno.Command;
  port: number;
}

export interface WorkerOptionsWithRefresh extends WorkerOptions {
  /**
   * Optional respawn interval in milliseconds.
   * When set, the worker will be automatically refreshed after this interval
   * to handle token expiration (e.g., for 30-minute duration tokens).
   * Default: undefined (no refresh)
   * Recommended: 25 * 60 * 1000 (25 minutes) for 30-minute tokens
   */
  respawnIntervalMs?: number;
}

/**
 * WorkerOptionsProvider can be either:
 * 1. Static WorkerOptions (no respawn functionality)
 * 2. Function returning Promise<WorkerOptionsWithRefresh> (with optional respawn)
 *
 * Examples:
 *
 * // Static options (no token refresh)
 * const staticOptions: WorkerOptions = {
 *   command: new Deno.Command("deno", { args: ["run", "app.ts"] }),
 *   port: 8080,
 *   persist: () => console.log("persisting...")
 * };
 *
 * // Dynamic options with token refresh
 * const dynamicOptions = async (): Promise<WorkerOptionsWithRefresh> => {
 *   return {
 *     command: createFreshCommand(), // This can include fresh tokens
 *     port: 8080,
 *     persist: () => console.log("persisting..."),
 *     respawnIntervalMs: 25 * 60 * 1000 // 25 minutes
 *   };
 * };
 */
export type WorkerOptionsProvider =
  | WorkerOptions
  | (() => Promise<WorkerOptionsWithRefresh>);

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

let wp = Promise.withResolvers<DenoRun>();
let refreshTimer: number | undefined;
let isShuttingDown = false;

export const worker = async () => {
  const w = await wp.promise;

  w.start();
  await w.waitUntilReady();

  return w;
};

const isProviderFn = (provider: unknown): provider is () => unknown =>
  typeof provider === "function";

const resolveWorkerOptions = async <
  T extends WorkerOptions | WorkerOptionsWithRefresh,
>(
  provider: T | (() => Promise<T>),
): Promise<T> => {
  if (isProviderFn(provider)) {
    return await provider();
  }
  return provider;
};

const hasRespawnInterval = (
  opts: WorkerOptionsWithRefresh,
): opts is Required<WorkerOptionsWithRefresh> => {
  return "respawnIntervalMs" in opts && opts.respawnIntervalMs !== undefined;
};

const scheduleRefresh = (
  optionsProvider: () => Promise<Required<WorkerOptionsWithRefresh>>,
  respawnIntervalMs: number,
) => {
  refreshTimer = setTimeout(async () => {
    if (isShuttingDown) {
      return;
    }

    console.log(
      "Refreshing worker with new options due to token expiration...",
    );
    dispatchWorkerState("updating");

    // Get fresh options (this will include new tokens)
    const freshOpts = await resolveWorkerOptions(optionsProvider);

    // Get the current worker
    const currentWorker = await wp.promise;

    // Create new worker promise resolvers
    const newWp = Promise.withResolvers<DenoRun>();

    // Create new worker instance with fresh options
    const newWorker = new DenoRun(freshOpts);

    // Start the new worker
    newWorker.start();
    await newWorker.waitUntilReady();

    // Resolve the new promise
    newWp.resolve(newWorker);

    // Replace the global promise
    wp = newWp;

    // Dispose of the old worker gracefully
    try {
      await currentWorker[Symbol.asyncDispose]();
    } catch (disposeError) {
      console.warn("Error disposing old worker:", disposeError);
    }

    console.log("Worker refreshed successfully with new options");
    dispatchWorkerState("ready");

    // Schedule next refresh
    scheduleRefresh(optionsProvider, freshOpts.respawnIntervalMs);
  }, respawnIntervalMs);
};

export const createWorker = (optionsProvider: WorkerOptionsProvider) => {
  const app = new Hono();

  // Initialize worker with initial options
  const initializeWorker = async () => {
    try {
      const initialOpts = await resolveWorkerOptions(optionsProvider);
      wp.resolve(new DenoRun(initialOpts));

      // Schedule refresh if interval is provided
      if (
        isProviderFn(optionsProvider) && hasRespawnInterval(initialOpts)
      ) {
        console.log(
          `Worker refresh scheduled every ${initialOpts.respawnIntervalMs}ms`,
        );
        scheduleRefresh(
          optionsProvider as () => Promise<Required<WorkerOptionsWithRefresh>>,
          initialOpts.respawnIntervalMs,
        );
      }
    } catch (error) {
      console.error("Error initializing worker:", error);
      wp.reject(error);
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
        isShuttingDown = true;

        // Clear refresh timer
        if (refreshTimer) {
          clearTimeout(refreshTimer);
          refreshTimer = undefined;
        }

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
