import {
  type ServerSentEventMessage,
  ServerSentEventStream,
} from "https://deno.land/std@0.208.0/http/server_sent_event_stream.ts";
import fjp from "npm:fast-json-patch@3.1.1";
import { debounce } from "std/async/debounce.ts";
import * as colors from "std/fmt/colors.ts";
import { tokenIsValid } from "../commons/jwt/engine.ts";
import { bundleApp } from "../scripts/apps/bundle.lib.ts";
import { Mutex } from "../utils/sync.ts";
import { getVerifiedJWT } from "./auth/checker.ts";
import { realtimeFor } from "./deps.ts";
import { cacheStaleMeta } from "./meta/cache.ts";
import { createDurableFS } from "./realtime/fs.ts";
import {
  HypervisorDiskStorage,
  HypervisorRealtimeState,
} from "./realtime/object.ts";
import { DenoRun } from "./workers/denoRun.ts";
import type { Isolate } from "./workers/isolate.ts";

const SECONDS = 1_000;
const MINUTE = 60 * SECONDS;

const Realtime = realtimeFor(Deno.upgradeWebSocket, createDurableFS, fjp);
const HYPERVISOR_API_SPECIFIER = "x-hypervisor-api";

const COMMIT_DEFAULT_ENDPOINT = "/volumes/default/commit";
const DEFAULT_LOGS_ENDPOINT = "/volumes/default/logs";

const BYPASS_JWT_VERIFICATION =
  Deno.env.get("DANGEROUSLY_ALLOW_PUBLIC_ACCESS") === "true";

export interface AppOptions {
  run: Deno.Command;
  build?: Deno.Command;
  buildFiles?: string;
  port: number;
  site: string;
}

export class Hypervisor {
  private realtimeFsState: HypervisorRealtimeState;
  private realtimeFs: InstanceType<typeof Realtime>;
  private isolate: Isolate;
  private logsStreamStarted = false;
  constructor(protected options: AppOptions) {
    const buildMutex = new Mutex();
    const buildCmd = options.build;
    const appBundle = bundleApp(Deno.cwd());
    const genManifest = () => {
      return appBundle({
        dir: ".",
        name: "site",
      });
    };
    const debouncedBuild = buildCmd
      ? debounce(async () => {
        if (buildMutex.freeOrNext()) {
          using _ = await buildMutex.acquire();
          const child = buildCmd.spawn();
          return await Promise.all([
            child.output().then(() => { }),
            genManifest(),
          ]).catch(
            (err) => {
              console.error("build err", err);
            },
          );
        }
      }, 200)
      : undefined;
    const storage = new HypervisorDiskStorage({
      dir: Deno.cwd(),
      buildFiles: options.buildFiles,
    });
    this.realtimeFsState = new HypervisorRealtimeState({
      storage,
    });
    let lastPersist = Promise.resolve();
    const debouncedPersist = this.realtimeFsState.shouldPersistState()
      ? debounce(() => {
        lastPersist = lastPersist.catch((_err) => { }).then(() => {
          return this.realtimeFsState.persistState();
        });
      }, 10 * MINUTE)
      : undefined; // 10m
    storage.onChange = (events) => {
      if (debouncedBuild) {
        const hasAnyCreationOrDeletion = events.some((evt) =>
          evt.path.startsWith("/islands/") ||
          (evt.type !== "modify" && (evt.path.endsWith(".ts") ||
            evt.path.endsWith(".tsx")))
        );
        if (hasAnyCreationOrDeletion) {
          debouncedBuild();
        }
      }
      debouncedPersist?.();
    };
    this.realtimeFs = new Realtime(
      this.realtimeFsState,
      // deno-lint-ignore no-explicit-any
      {} as any,
      false,
      true,
    );
    this.isolate = new DenoRun({
      command: options.run,
      port: options.port,
    });
  }

  errAs500(err: unknown) {
    console.error(
      colors.brightYellow(`isolate not available`),
      err,
    );
    return new Response(null, { status: 500 });
  }


  startLogsStream() {
    if (!this.logsStreamStarted) {
      this.logsStreamStarted = true;
      (async () => {
        for await (const log of this?.isolate?.logs?.() ?? []) {
          const logger = log.level === "error" ? console.error : console.log;
          logger(log.message.slice(0, -1));
        }
      })()
    }
  }
  public async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const isHypervisorApi = (req.headers.get(HYPERVISOR_API_SPECIFIER) ??
      url.searchParams.get(HYPERVISOR_API_SPECIFIER)) === "true";
    if (isHypervisorApi) {
      const pathname = url.pathname;
      if (pathname.startsWith("/.well-known/deco-validate/")) {
        const token = pathname.split("/").pop();
        const decoValidateEnvVar = Deno.env.get("DECO_VALIDATE_TOKEN");
        if (decoValidateEnvVar && token === decoValidateEnvVar) {
          return new Response(decoValidateEnvVar, { status: 200 });
        }
        return new Response(null, { status: 403 });
      }
      if (!BYPASS_JWT_VERIFICATION) {
        const jwt = await getVerifiedJWT(req);
        if (!jwt) {
          return new Response(null, { status: 401 });
        }
        if (!tokenIsValid(this.options.site, jwt)) {
          return new Response(null, { status: 403 });
        }
      }

      if (pathname.startsWith("/volumes")) {
        if (pathname === DEFAULT_LOGS_ENDPOINT) {
          const logs = this.isolate.logs();
          if (!logs) {
            return new Response(null, { status: 404 })
          }
          return new Response(
            new ReadableStream<ServerSentEventMessage>({
              async pull(controller) {
                for await (const content of logs) {
                  controller.enqueue({
                    data: encodeURIComponent(JSON.stringify(content)),
                    id: Date.now(),
                    event: "message",
                  });
                }
                controller.close();
              },
              cancel() {
              },
            }).pipeThrough(new ServerSentEventStream()),
            {
              headers: {
                "Content-Type": "text/event-stream",
              },
            },
          );
        }
        return this.realtimeFsState.wait().then(async () => {
          if (pathname === COMMIT_DEFAULT_ENDPOINT) {
            const { commitSha } = await req.json<{ commitSha: string }>();
            if (!commitSha) {
              return new Response(
                JSON.stringify({ message: "commit sha is missing" }),
                { status: 400 },
              );
            }
            await this.realtimeFsState.persistNext(commitSha);
            return new Response(null, { status: 204 });
          }
          return this.realtimeFs.fetch(req);
        })
          .catch(
            (err) => {
              console.error(
                "error when fetching realtimeFs",
                url.pathname,
                err,
              );
              return new Response(null, { status: 500 });
            },
          );
      }
    }

    if (!this.isolate.isRunning()) {
      this.isolate.start();
      this.startLogsStream();
      await this.isolate.waitUntilReady();
    }
    const { then: updateMetaStaleCache, catch: useMetaStaleCache } =
      cacheStaleMeta(url);
    return this.isolate.fetch(req).then(updateMetaStaleCache).catch(
      useMetaStaleCache,
    ).catch(async (err) => {
      if (this.isolate.isRunning()) {
        await this.isolate.waitUntilReady().catch((_err) => { });
        return this.isolate.fetch(req).catch(this.errAs500);
      }
      return this.errAs500(err);
    });
  }
  public proxySignal(signal: Deno.Signal) {
    this.isolate?.signal(signal);
    return this.realtimeFsState.persistState().catch((err) => {
      console.log("error when trying to persist state", err);
    });
  }
  public async shutdown() {
    await this.isolate?.[Symbol.asyncDispose]();
  }
}
