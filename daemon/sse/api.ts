import * as colors from "@std/fmt/colors";
import {
  type ServerSentEventMessage,
  ServerSentEventStream,
} from "@std/http/server-sent-event-stream";
import { Hono } from "deco/runtime/deps.ts";
import { start as startFS } from "../fs/api.ts";
import { start as startMeta } from "../meta.ts";
import { start as startWorker } from "../worker.ts";
import { channel, type DaemonEvent } from "./channel.ts";

export const createSSE = () => {
  const app = new Hono();

  app.get("/watch", (c) => {
    const signal = c.req.raw.signal;
    const done = Promise.withResolvers<void>();
    const since = Number(c.req.query("since"));

    const enqueue = (
      controller: ReadableStreamDefaultController<ServerSentEventMessage>,
      event: DaemonEvent,
    ) =>
      !signal.aborted && controller.enqueue({
        data: encodeURIComponent(JSON.stringify(event)),
        event: "message",
      });

    return new Response(
      new ReadableStream<ServerSentEventMessage>({
        async start(controller) {
          console.log(colors.bold(`[sse]:`), "stream is", colors.green("open"));

          const handler = (e: CustomEvent<DaemonEvent>) =>
            enqueue(controller, e.detail);

          // @ts-expect-error TS does not handle well this case
          channel.addEventListener("broadcast", handler);
          done.promise.then(() => {
            // @ts-expect-error TS does not handle well this case
            channel.removeEventListener("broadcast", handler);
          });

          for await (const event of startFS(since)) {
            if (signal.aborted) {
              return;
            }
            enqueue(controller, event);
          }

          enqueue(controller, startWorker());

          startMeta(since)
            .then((meta) => meta && enqueue(controller, meta))
            .catch(console.error);

          return done.promise;
        },
        cancel() {
          done.resolve();
          console.log(colors.bold(`[sse]:`), "stream is", colors.red("closed"));
        },
      }).pipeThrough(new ServerSentEventStream()),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });

  return app;
};
