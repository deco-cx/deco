import * as colors from "std/fmt/colors.ts";
import { realtimeFor } from "./deps.ts";
import { createDurableFS } from "./fs.ts";
import {
  HypervisorDiskStorage,
  HypervisorRealtimeState,
} from "./realtime/object.ts";
import { DenoRun } from "./workers/denoRun.ts";
import { Isolate } from "./workers/isolate.ts";
const Realtime = realtimeFor(Deno.upgradeWebSocket, createDurableFS);
const HYPERVISOR_API_SPECIFIER = "x-hypervisor-api";

export interface AppOptions {
  run: Deno.Command;
  build?: Deno.Command;
  port: number;
}
export class Hypervisor {
  private realtimeFsState: HypervisorRealtimeState;
  private realtimeFs: InstanceType<typeof Realtime>;
  private isolate: Isolate;
  constructor(protected options: AppOptions) {
    let lastBuildCmd = Promise.resolve();
    const buildCmd = options.build;
    const storage = new HypervisorDiskStorage({
      dir: Deno.cwd(),
      onChange: buildCmd
        ? (events) => {
          const hasAnyCreationOrDeletion = events.some((evt) =>
            evt.type !== "modify" && evt.path.endsWith(".ts") ||
            evt.path.endsWith(".tsx")
          );
          if (hasAnyCreationOrDeletion) {
            lastBuildCmd = lastBuildCmd.catch((_err) => {}).then(() => {
              const child = buildCmd.spawn();
              return child.output().then(() => {});
            });
          }
        }
        : undefined,
    });
    // TODO (@mcandeia) Deal with ephemeral volumes like presence
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
    if (isHypervisorApi && url.pathname.startsWith("/volumes")) {
      return this.realtimeFsState.wait().then(() => this.realtimeFs.fetch(req))
        .catch(
          (err) => {
            console.error("error when fetching realtimeFs", url.pathname, err);
            return new Response(null, { status: 500 });
          },
        );
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
