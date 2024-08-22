import * as colors from "@std/fmt/colors";
import {
  type ServerSentEventMessage,
  ServerSentEventStream,
} from "@std/http/server-sent-event-stream";
import { Hono } from "deco/runtime/deps.ts";
import { start as startFS } from "../fs/api.ts";
import { start as startMeta } from "../meta.ts";
import { start as startWorker } from "../worker.ts";
import { type DaemonEvent, listen } from "./channel.ts";

const enqueue = (
  controller: ReadableStreamDefaultController<ServerSentEventMessage>,
  event: DaemonEvent,
) =>
  controller.enqueue({
    data: encodeURIComponent(JSON.stringify(event)),
    event: "message",
  });

export const createSSE = () => {
  const app = new Hono();

  app.get("/watch", (c) => {
    const since = Number(c.req.query("since"));

    return new Response(
      new ReadableStream<ServerSentEventMessage>({
        async start(controller) {
          console.log(colors.bold(`[sse]:`), "stream is", colors.green("open"));

          for await (const event of startFS(since)) {
            enqueue(controller, event);
          }

          enqueue(controller, startWorker());

          startMeta()
            .then((meta) => enqueue(controller, meta))
            .catch(console.error);
        },
        async pull(controller) {
          for await (const event of listen(c.req.raw.signal)) {
            enqueue(controller, event);
          }
          controller.close();
        },
        cancel() {
          console.log(colors.bold(`[sse]:`), "stream is", colors.red("closed"));
        },
      }).pipeThrough(new ServerSentEventStream()),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });

  return app;
};
