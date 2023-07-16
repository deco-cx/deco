export interface StreamProps {
  id: string;
  stream: true;
}

export const isStreamProps = <TProps>(
  props: TProps | TProps & StreamProps,
): props is TProps & StreamProps => {
  return Boolean((props as StreamProps)?.stream) === true;
};

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
  if (isEventStreamResponse(invokeResponse)) {
    req.signal.onabort = () => {
      invokeResponse?.return?.();
    };
    const { readable, writable } = new TransformStream();
    (async () => {
      const encoder = new TextEncoder();
      const writer = writable.getWriter();

      try {
        for await (const content of invokeResponse) {
          await writer.write(encoder.encode(JSON.stringify(content)));
        }
      } finally {
        try {
          await writer.close();
        } catch (err) {
          console.log("closing err", err);
        }
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "connection": "keep-alive",
        "cache-control": "no-cache",
      },
    });
  }
  // otherwise convert invoke response to json
  return Response.json(invokeResponse);
};
