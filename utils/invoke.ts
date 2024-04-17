export interface StreamProps {
  id: string;
  stream: true;
}

export { isStreamProps } from "../clients/withManifest.ts";
import {
  ServerSentEventMessage,
  ServerSentEventStream,
} from "https://deno.land/std@0.208.0/http/server_sent_event_stream.ts";

export const isEventStreamResponse = (
  invokeResponse: unknown | AsyncIterableIterator<unknown>,
): invokeResponse is AsyncIterableIterator<unknown> => {
  return typeof (invokeResponse as AsyncIterableIterator<unknown>)?.next ===
    "function";
};

/**
 * Converts an invoke result to a valid http response based on the return type
 */
export const invokeToHttpResponse = (
  req: Request,
  invokeResponse: unknown,
): Response => {
  if (invokeResponse === undefined) {
    return new Response(null, { status: 204 });
  }

  if (invokeResponse instanceof Response) {
    return invokeResponse;
  }

  if (isEventStreamResponse(invokeResponse)) {
    req.signal.onabort = () => {
      invokeResponse?.return?.();
    };

    return new Response(
      new ReadableStream<ServerSentEventMessage>({
        async pull(controller) {
          for await (const content of invokeResponse) {
            controller.enqueue({
              data: encodeURIComponent(JSON.stringify(content)),
              id: Date.now(),
              event: "message",
            });
          }
          controller.close();
        },
        cancel() {
          invokeResponse?.return?.();
        },
      }).pipeThrough(new ServerSentEventStream()),
      {
        headers: {
          "Content-Type": "text/event-stream",
        },
      },
    );
  }
  // otherwise convert invoke response to json
  return Response.json(invokeResponse);
};
