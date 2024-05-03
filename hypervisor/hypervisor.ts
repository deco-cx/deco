import fjp from "npm:fast-json-patch@3.1.1";
import { debounce } from "std/async/debounce.ts";
import * as colors from "std/fmt/colors.ts";
import { tokenIsValid } from "../commons/jwt/engine.ts";
import { getVerifiedJWT } from "./auth/checker.ts";
import { realtimeFor } from "./deps.ts";
import { createDurableFS } from "./realtime/fs.ts";
import {
  HypervisorDiskStorage,
  HypervisorRealtimeState,
} from "./realtime/object.ts";
import { DenoRun } from "./workers/denoRun.ts";
import type { Isolate } from "./workers/isolate.ts";

const Realtime = realtimeFor(Deno.upgradeWebSocket, createDurableFS, fjp);
const HYPERVISOR_API_SPECIFIER = "x-hypervisor-api";

const COMMIT_DEFAULT_ENDPOINT = "/volumes/default/commit";

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
  constructor(protected options: AppOptions) {
    let lastBuildCmd = Promise.resolve();
    const buildCmd = options.build;
    const debouncedBuild = buildCmd
      ? debounce(() => {
        lastBuildCmd = lastBuildCmd.catch((_err) => {}).then(() => {
          const child = buildCmd.spawn();
          return child.output().then(() => {});
        });
      }, 200)
      : undefined;
    const storage = new HypervisorDiskStorage({
      dir: Deno.cwd(),
      buildFiles: options.buildFiles,
      onChange: debouncedBuild
        ? (events) => {
          const hasAnyCreationOrDeletion = events.some((evt) =>
            evt.type !== "modify" && evt.path.endsWith(".ts") ||
            evt.path.endsWith(".tsx")
          );
          if (hasAnyCreationOrDeletion) {
            debouncedBuild();
          }
        }
        : undefined,
    });
    this.realtimeFsState = new HypervisorRealtimeState({
      storage,
    });
    // deno-lint-ignore no-explicit-any
    this.realtimeFs = new Realtime(this.realtimeFsState, {} as any);
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
      const jwt = await getVerifiedJWT(req);
      if (!jwt) {
        return new Response(null, { status: 401 });
      }
      if (!tokenIsValid(this.options.site, jwt)) {
        return new Response(null, { status: 403 });
      }
      if (pathname.startsWith("/volumes")) {
        return this.realtimeFsState.wait().then(async () => {
          if (pathname === COMMIT_DEFAULT_ENDPOINT) {
            const { commitSha } = await req.json<{ commitSha: string }>();
            if (!commitSha) {
              return new Response(
                JSON.stringify({ message: "commit sha is missing" }),
                { status: 400 },
              );
            }
            await this.realtimeFsState.persist(commitSha);
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
      await this.isolate.waitUntilReady();
    }
    return this.isolate.fetch(req).catch(async (err) => {
      if (this.isolate.isRunning()) {
        await this.isolate.waitUntilReady().catch((_err) => {});
        return this.isolate.fetch(req).catch(this.errAs500);
      }
      return this.errAs500(err);
    });
  }
  public proxySignal(signal: Deno.Signal) {
    this.isolate?.signal(signal);
  }
  public async shutdown() {
    await this.isolate?.[Symbol.asyncDispose]();
  }
}
