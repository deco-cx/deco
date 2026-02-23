import { Hono } from "@hono/hono";
import { broadcast } from "./sse/channel.ts";
import { DenoRun } from "./workers/denoRun.ts";
import { NodeRun } from "./workers/nodeRun.ts";
import type { Isolate } from "./workers/isolate.ts";

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

const wp = Promise.withResolvers<Isolate>();

export const worker = async () => {
  const w = await wp.promise;

  w.start?.();
  await w.waitUntilReady?.();

  return w;
};

const createIsolate = (options: WorkerOptions): Isolate => {
  // Detect worker type based on command
  const commandName = (options.command as any).command;
  
  // Check if it's a Node.js package manager command
  if (commandName === "npm" || commandName === "yarn" || commandName === "pnpm") {
    return new NodeRun({ command: options.command, port: options.port });
  }
  
  // Default to DenoRun for Deno projects
  return new DenoRun({ command: options.command, port: options.port });
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
    const initialOpts = await resolveWorkerOptions(optionsProvider);
    wp.resolve(createIsolate(initialOpts));
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
          w.signal?.(signal);
          w[Symbol.asyncDispose]?.();
        });
        self.close();
      });
    } catch {
      /** Windows machines don't have sigterm */
    }
  }

  return app;
};
