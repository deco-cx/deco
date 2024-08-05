import type { DenoRun } from "deco/daemon/workers/denoRun.ts";
import { ensureDir, exists } from "std/fs/mod.ts";
import { ENV_SITE_NAME } from "../engine/decofile/constants.ts";
import { genMetadata } from "../engine/decofile/fsFolder.ts";
import { createAuth } from "./auth.ts";
import {
  Hono,
  type ServerSentEventMessage,
  ServerSentEventStream,
} from "./deps.ts";
import { createGitAPIS } from "./git.ts";
import { createRealtimeAPIs } from "./realtime/app.ts";

export const DECO_SITE_NAME = Deno.env.get(ENV_SITE_NAME);

const MAX_LENGTH = 10_000;
const DEFAULT_LOGS_ENDPOINT = "/volumes/default/logs";

export const DENO_FS_APIS = { ...Deno, exists, ensureDir };
const DAEMON_API_SPECIFIER = "x-daemon-api";
const HYPERVISOR_API_SPECIFIER = "x-hypervisor-api";

interface DaemonOptions {
  build: Deno.Command | null;
  site: string;
  worker?: DenoRun;
}

export const createDaemonAPIs = (
  options: DaemonOptions,
): Hono.MiddlewareHandler => {
  const app = new Hono.Hono();

  // auth
  app.all("/.well-known/deco-validate/:token", (c) => {
    const { token } = c.req.param();
    const decoValidateEnvVar = Deno.env.get("DECO_VALIDATE_TOKEN");
    if (decoValidateEnvVar && token === decoValidateEnvVar) {
      return new Response(decoValidateEnvVar, { status: 200 });
    }
    return new Response(null, { status: 403 });
  });

  app.use(createAuth({ site: options.site }));

  app.route("/git", createGitAPIS(options));

  app.use("/volumes/*", async (_c, next) => {
    await blocksJSONPromise;
    await next();
  });

  app.all(DEFAULT_LOGS_ENDPOINT, () => {
    const logs = options.worker?.logs();

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

  app.route("/volumes/:id/files", createRealtimeAPIs());

  const blocksJSONPromise = genMetadata();

  return async (c, next) => {
    const isDaemonAPI = c.req.header(DAEMON_API_SPECIFIER) ??
      c.req.header(HYPERVISOR_API_SPECIFIER) ??
      c.req.query(DAEMON_API_SPECIFIER) === "true";

    if (!isDaemonAPI) {
      return await next();
    }

    c.res = await app.fetch(c.req.raw);
  };
};
