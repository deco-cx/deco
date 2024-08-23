import { Hono, type MiddlewareHandler } from "@hono/hono";
import {
  type ServerSentEventMessage,
  ServerSentEventStream,
} from "@std/http/server-sent-event-stream";
import { ENV_SITE_NAME } from "../engine/decofile/constants.ts";
import { createAuth } from "./auth.ts";
import { createFSAPIs } from "./fs/api.ts";
import { createGitAPIS } from "./git.ts";
import { logs } from "./loggings/stream.ts";
import { createRealtimeAPIs } from "./realtime/app.ts";
import { createSSE } from "./sse/api.ts";

export const DECO_SITE_NAME = Deno.env.get(ENV_SITE_NAME);
export const DECO_ENV_NAME = Deno.env.get("DECO_ENV_NAME");

const DEFAULT_LOGS_ENDPOINT = "/volumes/default/logs";
const DAEMON_API_SPECIFIER = "x-daemon-api";
const HYPERVISOR_API_SPECIFIER = "x-hypervisor-api";

interface DaemonOptions {
  build: Deno.Command | null;
  site: string;
}

export const createDaemonAPIs = (
  options: DaemonOptions,
): MiddlewareHandler => {
  const app = new Hono();

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

  app.all(DEFAULT_LOGS_ENDPOINT, () => {
    const l = logs.read();

    if (!l) {
      return new Response(null, { status: 404 });
    }

    return new Response(
      new ReadableStream<ServerSentEventMessage>({
        async pull(controller) {
          for await (const content of l) {
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
  });

  app.route("/volumes/:id/files", createRealtimeAPIs());
  app.route("/fs", createFSAPIs());
  app.route("", createSSE());

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
