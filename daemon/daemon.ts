import {
  type ServerSentEventMessage,
  ServerSentEventStream,
} from "https://deno.land/std@0.208.0/http/server_sent_event_stream.ts";
import fjp from "npm:fast-json-patch@3.1.1";
import { debounce } from "std/async/debounce.ts";
import * as colors from "std/fmt/colors.ts";
import { ensureDir, exists } from "std/fs/mod.ts";
import { tokenIsValid } from "../commons/jwt/engine.ts";
import { ENV_SITE_NAME } from "../engine/decofile/constants.ts";
import {
  BLOCKS_FOLDER,
  DECO_FOLDER,
  genMetadata,
} from "../engine/decofile/fsFolder.ts";
import { bundleApp } from "../scripts/apps/bundle.lib.ts";
import { Mutex } from "../utils/sync.ts";
import { getVerifiedJWT } from "./auth/checker.ts";
import { realtimeFor } from "./deps.ts";
import gitApp from "./git.ts";
import { cacheStaleMeta } from "./meta/cache.ts";
import { createDurableFS } from "./realtime/fs.ts";
import {
  DaemonDiskStorage,
  DaemonRealtimeState,
  type FileSystemApi,
} from "./realtime/object.ts";
import { DenoRun } from "./workers/denoRun.ts";
import type { Isolate } from "./workers/isolate.ts";

const SECONDS = 1_000;
const MINUTE = 60 * SECONDS;
const MAX_LENGTH = 10_000;

export const DECO_SITE_NAME = Deno.env.get(ENV_SITE_NAME);

export const DENO_FS_APIS = { ...Deno, exists, ensureDir };
const Realtime = realtimeFor(Deno.upgradeWebSocket, createDurableFS, fjp);
const DAEMON_API_SPECIFIER = "x-daemon-api";
const HYPERVISOR_API_SPECIFIER = "x-hypervisor-api";

const COMMIT_DEFAULT_ENDPOINT = "/volumes/default/commit";
const DEFAULT_LOGS_ENDPOINT = "/volumes/default/logs";

const BYPASS_JWT_VERIFICATION =
  Deno.env.get("DANGEROUSLY_ALLOW_PUBLIC_ACCESS") === "true";

export interface DaemonBaseOptions {
  build: Deno.Command | null;
  buildFiles?: string;
  fsApi?: FileSystemApi;
}

export interface DaemonIsolateOptions extends DaemonBaseOptions {
  isolate?: Isolate;
}

export interface DaemonExternalProcessOptions extends DaemonBaseOptions {
  run: Deno.Command | null;
  port: number;
}

export type DaemonOptions = DaemonIsolateOptions | DaemonExternalProcessOptions;

const isIsolateOptions = (
  options?: DaemonOptions,
): options is DaemonIsolateOptions => {
  return (options as DaemonExternalProcessOptions)?.run === undefined;
};

import { Hono } from "./deps.ts";

const daemonApp = new Hono.Hono();
daemonApp.route("/git", gitApp);

export class Daemon {
  private realtimeFsState: DaemonRealtimeState;
  private realtimeFs: InstanceType<typeof Realtime>;
  private isolate?: Isolate;
  private logsStreamStarted = false;
  constructor(protected options?: DaemonOptions) {
    const buildMutex = new Mutex();
    const buildCmd = options?.build;
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
            child.output().then(() => {}),
            genManifest(),
          ]).catch(
            (err) => {
              console.error("build err", err);
            },
          );
        }
      }, 200)
      : undefined;
    const storage = new DaemonDiskStorage({
      dir: Deno.cwd(),
      buildFiles: options?.buildFiles,
      fsApi: options?.fsApi ?? DENO_FS_APIS,
    });
    this.realtimeFsState = new DaemonRealtimeState({
      storage,
    });

    this.realtimeFsState.blockConcurrencyWhile(
      async () => {
        const meta = await genMetadata();
        meta && storage.put(meta.path, meta.content);
      },
    );

    let lastPersist = Promise.resolve();
    const debouncedPersist = this.realtimeFsState.shouldPersistState()
      ? debounce(() => {
        lastPersist = lastPersist.catch((_err) => {}).then(() => {
          return this.realtimeFsState.persistState();
        });
      }, 2 * MINUTE)
      : undefined; // 10m

    const debouncedMetadataGenFromFS = debounce(
      async () => {
        const meta = await genMetadata();
        meta && storage.put(meta.path, meta.content);
      },
      250,
    );

    storage.onChange = (events) => {
      // Generate new blocks.json if there are changes in .deco/blocks
      if (
        events.some((e) => e.path.includes(`${DECO_FOLDER}/${BLOCKS_FOLDER}`))
      ) {
        debouncedMetadataGenFromFS();
      }

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
    this.isolate = isIsolateOptions(options)
      ? options?.isolate
      : options?.run
      ? new DenoRun({
        command: options.run,
        port: options.port,
      })
      : undefined;

    // auth
    daemonApp.all("/.well-known/deco-validate/:token", (c) => {
      const { token } = c.req.param();
      const decoValidateEnvVar = Deno.env.get("DECO_VALIDATE_TOKEN");
      if (decoValidateEnvVar && token === decoValidateEnvVar) {
        return new Response(decoValidateEnvVar, { status: 200 });
      }
      return new Response(null, { status: 403 });
    });
    daemonApp.use(async (c, next) => {
      if (!BYPASS_JWT_VERIFICATION) {
        const jwt = await getVerifiedJWT(c.req.raw);
        if (!jwt) {
          return new Response(null, { status: 401 });
        }
        if (DECO_SITE_NAME && !tokenIsValid(DECO_SITE_NAME, jwt)) {
          return new Response(null, { status: 403 });
        }
      }
      await next();
    });

    // FS APIs
    daemonApp.all(DEFAULT_LOGS_ENDPOINT, () => {
      const logs = this.isolate?.logs?.();
      if (!logs) {
        return new Response(null, { status: 404 });
      }
      return new Response(
        new ReadableStream<ServerSentEventMessage>({
          async pull(controller) {
            for await (const content of logs) {
              controller.enqueue({
                data: encodeURIComponent(JSON.stringify({
                  ...content,
                  message: content.message.length > MAX_LENGTH
                    ? `${content.message.slice(0, MAX_LENGTH)}...`
                    : content.message,
                })),
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
    });
    daemonApp.use("/volumes/*", async (_c, next) => {
      await this.realtimeFsState.wait();
      await next();
    });
    daemonApp.all(COMMIT_DEFAULT_ENDPOINT, async (c) => {
      const { commitSha } = await c.req.json<{ commitSha: string }>();
      if (!commitSha) {
        return new Response(
          JSON.stringify({ message: "commit sha is missing" }),
          { status: 400 },
        );
      }
      await this.realtimeFsState.persistNext(commitSha);
      return new Response(null, { status: 204 });
    });
    daemonApp.all("/volumes/*", (c) => this.realtimeFs.fetch(c.req.raw));
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
      })();
    }
  }
  public async fetch(req: Request, maybeIsolate?: Isolate): Promise<Response> {
    const isolate = maybeIsolate ?? this.isolate;
    const url = new URL(req.url);
    const isDaemonAPI = (req.headers.get(DAEMON_API_SPECIFIER) ??
      req.headers.get(HYPERVISOR_API_SPECIFIER) ??
      url.searchParams.get(DAEMON_API_SPECIFIER)) === "true";

    if (isDaemonAPI) {
      return daemonApp.fetch(req);
    }

    if (isolate === undefined) {
      return this.errAs500(
        "isolate is not defined neither inline or via params",
      );
    }

    if (isolate.isRunning?.() === false) {
      isolate.start?.();
      this.startLogsStream();
      await isolate.waitUntilReady?.();
    }
    const { then: updateMetaStaleCache, catch: useMetaStaleCache } =
      cacheStaleMeta(url);
    return isolate.fetch(req).then(updateMetaStaleCache).catch(
      useMetaStaleCache,
    ).catch(async (err) => {
      if (isolate.isRunning?.()) {
        await isolate.waitUntilReady?.().catch((_err) => {});
        return isolate.fetch(req).catch(this.errAs500);
      }
      return this.errAs500(err);
    });
  }
  public persistState() {
    return this.realtimeFsState.persistState().catch((err) => {
      console.log("error when trying to persist state", err);
    });
  }
  public proxySignal(signal: Deno.Signal) {
    this.isolate?.signal?.(signal);
    return this.persistState();
  }
  public async shutdown() {
    await this.isolate?.[Symbol.asyncDispose]?.();
  }
}
