import {
  type ServerSentEventMessage,
  ServerSentEventStream,
} from "@std/http/server-sent-event-stream";
import { encodeBase64 } from "@std/encoding/base64";
import { Hono } from "../../runtime/deps.ts";
import { start as startFS } from "../fs/api.ts";
import { start as startMeta } from "../meta.ts";
import { start as startWorker } from "../worker.ts";
import { channel, type DaemonEvent } from "./channel.ts";

// Compress large payloads using gzip
const compress = async (data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const stream = new Blob([encoder.encode(data)]).stream();
  const compressed = stream.pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(compressed).arrayBuffer();
  return encodeBase64(new Uint8Array(buffer));
};

export const createSSE = () => {
  const app = new Hono();

  app.get("/watch", (c) => {
    const signal = c.req.raw.signal;
    const done = Promise.withResolvers<void>();
    const since = Number(c.req.query("since"));
    // Check if client supports gzip encoding (backward compatibility)
    const clientSupportsGzip =
      c.req.header("X-SSE-Encoding")?.includes("gzip") ?? false;
    let eventCounter = 0;

    const enqueue = async (
      controller: ReadableStreamDefaultController<ServerSentEventMessage>,
      event: DaemonEvent,
    ) => {
      if (signal.aborted) return;
      eventCounter++;

      const jsonStr = JSON.stringify(event);
      // Only compress if client supports it AND payload is large
      const shouldCompress = clientSupportsGzip && jsonStr.length > 50_000;

      let data: string;
      if (shouldCompress) {
        // For large payloads, gzip compress and base64 encode
        const compressedData = await compress(jsonStr);
        data = `gzip:${compressedData}`;
      } else {
        data = encodeURIComponent(jsonStr);
      }

      controller.enqueue({
        data,
        event: "message",
      });
    };

    return new Response(
      new ReadableStream<ServerSentEventMessage>({
        async start(controller) {
          const handler = (e: CustomEvent<DaemonEvent>) => {
            enqueue(controller, e.detail).catch(console.error);
          };

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
            await enqueue(controller, event);
          }

          await enqueue(controller, startWorker());

          startMeta(since)
            .then(async (meta) => meta && await enqueue(controller, meta))
            .catch(console.error);

          return done.promise;
        },
        cancel() {
          done.resolve();
        },
      }).pipeThrough(new ServerSentEventStream()),
      { headers: { "Content-Type": "text/event-stream" } },
    );
  });

  return app;
};
