import { Hono } from "@hono/hono";
import { broadcast } from "./sse/channel.ts";
import { SANDBOX_MODE } from "./daemon.ts";
import { delay } from "../utils/async.ts";
import { DenoRun } from "./workers/denoRun.ts";

// How long a request waits for a cold dev server to come up before we stop
// holding the connection open and reply 503 (SANDBOX_MODE only). Kept well
// under the CDN origin timeout so the env ingress can bounce to the activator
// and retry, instead of the request hanging until the CDN returns a 504.
const SANDBOX_READY_GATE_MS = 5_000;

// Header + per-process token used by the daemon's own internal warmup request
// to bypass the fast-503 gate (it must block until the worker is ready so it
// can actually render the entry route). The token is random per process so a
// forged `x-deco-warmup` header on public traffic can't match and is treated
// as a normal request.
export const WARMUP_HEADER = "x-deco-warmup";
export const WARMUP_TOKEN: string = crypto.randomUUID();

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
      // Warmup requests (and normal, non-sandbox mode) keep the original
      // blocking behavior: wait for the worker to be fully ready, then proxy.
      // This is what lets the warmup request actually JIT-compile and render
      // the entry route — a fast-503 gate would skip the render entirely.
      const isWarmup = c.req.header(WARMUP_HEADER) === WARMUP_TOKEN;
      if (SANDBOX_MODE && !isWarmup) {
        // worker() boots the dev server (idempotent) and resolves once it is
        // listening; it rejects if the boot fails (missing dev.ts, crash, ...).
        // On a cold sandbox the boot can take a while, so rather than hold the
        // request open the whole time — which lets the CDN time out as a 504 —
        // we race it against a short gate:
        //   - still booting at the gate  -> 503 (retryable): the env ingress
        //     (error_page 502 503 -> @admin) bounces to the activator and the
        //     boot keeps running in the background, so the retry lands warm.
        //   - boot rejected              -> 424 (non-retryable): a real failure
        //     that won't fix itself, so we don't loop the activator forever.
        // Mapping the rejection inline (not throwing) keeps the loser of the
        // race from surfacing as an unhandled rejection once we've replied.
        const boot = worker().then(
          () => "ready" as const,
          (err: unknown) => ({ err }),
        );
        const outcome = await Promise.race([
          boot,
          delay(SANDBOX_READY_GATE_MS).then(() => "timeout" as const),
        ]);
        if (outcome === "timeout") {
          c.res = new Response("Sandbox environment is starting", {
            status: 503,
            headers: { "retry-after": "2" },
          });
          return;
        }
        if (typeof outcome === "object") {
          console.error(outcome.err);
          c.res = new Response(`Error while starting worker`, { status: 424 });
          return;
        }
      } else {
        await worker();
      }
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
