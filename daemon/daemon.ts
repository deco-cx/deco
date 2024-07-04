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
import { bundleApp } from "../scripts/apps/bundle.lib.ts";
import { Mutex } from "../utils/sync.ts";
import { getVerifiedJWT } from "./auth/checker.ts";
import { realtimeFor } from "./deps.ts";
import { cacheStaleMeta } from "./meta/cache.ts";
import { createDurableFS } from "./realtime/fs.ts";
import {
  DaemonDiskStorage,
  DaemonRealtimeState,
  type FileSystemApi,
} from "./realtime/object.ts";
import { DenoRun } from "./workers/denoRun.ts";
import type { Isolate } from "./workers/isolate.ts";
import * as git from "npm:isomorphic-git@1.25.6";
import * as nodefs from "node:fs";

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
const DIFF_DEFAULT_ENDPOINT = "/volumes/default/diff";

const BYPASS_JWT_VERIFICATION =
  Deno.env.get("DANGEROUSLY_ALLOW_PUBLIC_ACCESS") === "true";

export interface DaemonBaseOptions {
  build?: Deno.Command;
  buildFiles?: string;
  fsApi?: FileSystemApi;
}

export interface DaemonIsolateOptions extends DaemonBaseOptions {
  isolate?: Isolate;
}

export interface DaemonExternalProcessOptions extends DaemonBaseOptions {
  run: Deno.Command;
  port: number;
}

export type DaemonOptions = DaemonIsolateOptions | DaemonExternalProcessOptions;

const isIsolateOptions = (
  options?: DaemonOptions,
): options is DaemonIsolateOptions => {
  return (options as DaemonExternalProcessOptions)?.run === undefined;
};

export interface Diff {
  from: string | null;
  to: string | null;
  status: string;
}
export interface DiffResult {
  diffs: Record<string, Diff>;
}

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
    git.init({ fs: nodefs, dir: Deno.cwd() })
      .then(() => {
        console.log("Repository initialized");
      })
      .catch((err) => {
        console.error("Error initializing repository", err);
      });
    const storage = new DaemonDiskStorage({
      dir: Deno.cwd(),
      buildFiles: options?.buildFiles,
      fsApi: options?.fsApi ?? DENO_FS_APIS,
    });
    this.realtimeFsState = new DaemonRealtimeState({
      storage,
    });
    let lastPersist = Promise.resolve();
    const debouncedPersist = this.realtimeFsState.shouldPersistState()
      ? debounce(() => {
        lastPersist = lastPersist.catch((_err) => {}).then(() => {
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
    this.isolate = isIsolateOptions(options)
      ? options?.isolate
      : options
      ? new DenoRun({
        command: options.run,
        port: options.port,
      })
      : undefined;
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
  private async diff(): Promise<DiffResult> {
    const result = await git.statusMatrix({ fs: nodefs, dir: Deno.cwd() });

    const diffs: Record<string, Diff> = {};
    const fileCache: Record<string, string> = {};
    const decoder = new TextDecoder();
  
    const readFileContent = async (filepath: string | null): Promise<string | null> => {
      if (!filepath) return null;
      if (fileCache[filepath] !== undefined) return fileCache[filepath];
      try {
        const content = decoder.decode(await Deno.readFile(filepath));
        fileCache[filepath] = content;
        return content;
      } catch (error) {
        console.error(`Error reading file ${filepath}:`, error);
        return null;
      }
    };

    const promises = result.map(async ([filepath, head, workdir, stage]) => {
      let fromPath: string | null = null;
      let toPath: string | null = null;
      let status: string = '';
  
      if (head === 0 && workdir === 2 && stage === 0) {
        fromPath = null;
        toPath = filepath;
        status = 'untracked';
      } else if (head === 0 && workdir === 2 && stage === 2) {
        fromPath = null;
        toPath = filepath;
        status = 'added';
      } else if (head === 0 && workdir === 2 && stage === 3) {
        fromPath = null;
        toPath = filepath;
        status = 'added with unstaged changes';
      } else if (head === 1 && workdir === 1 && stage === 1) {
        // Skip unmodified
        return;
      } else if (head === 1 && workdir === 2 && stage === 1) {
        fromPath = filepath;
        toPath = filepath;
        status = 'modified';
      } else if (head === 1 && workdir === 2 && stage === 2) {
        fromPath = filepath;
        toPath = filepath;
        status = 'modified and staged';
      } else if (head === 1 && workdir === 2 && stage === 3) {
        fromPath = filepath;
        toPath = filepath;
        status = 'modified and staged with unstaged changes';
      } else if (head === 1 && workdir === 0 && stage === 1) {
        fromPath = filepath;
        toPath = null;
        status = 'deleted';
      } else if (head === 1 && workdir === 0 && stage === 0) {
        fromPath = filepath;
        toPath = null;
        status = 'deleted and staged';
      } else if (head === 1 && workdir === 2 && stage === 0) {
        fromPath = filepath;
        toPath = filepath;
        status = 'deleted and staged with unstaged changes';
      } else if (head === 1 && workdir === 1 && stage === 0) {
        fromPath = filepath;
        toPath = filepath;
        status = 'deleted and staged with unstaged changes';
      }
  
      const [from, to] = await Promise.all([readFileContent(fromPath), readFileContent(toPath)]);
      diffs[filepath] = { from, to, status };
    });
  
    await Promise.all(promises);
  
    return { diffs };
  }
  public async fetch(req: Request, maybeIsolate?: Isolate): Promise<Response> {
    const isolate = maybeIsolate ?? this.isolate;
    console.log("isolate", isolate);
    if (isolate === undefined) {
      return this.errAs500(
        "isolate is not defined neither inline or via params",
      );
    }
    const url = new URL(req.url);
    const isDaemonAPI = (req.headers.get(DAEMON_API_SPECIFIER) ??
      req.headers.get(HYPERVISOR_API_SPECIFIER) ??
      url.searchParams.get(DAEMON_API_SPECIFIER)) === "true";
    if (isDaemonAPI) {
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
        if (DECO_SITE_NAME && !tokenIsValid(DECO_SITE_NAME, jwt)) {
          return new Response(null, { status: 403 });
        }
      }

      if (pathname.startsWith("/volumes")) {
        if (pathname === DIFF_DEFAULT_ENDPOINT) {
          const result = await this.diff();
          return new Response(JSON.stringify(result), { status: 200 });
        }
        if (pathname === DEFAULT_LOGS_ENDPOINT) {
          const logs = isolate.logs?.();
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
