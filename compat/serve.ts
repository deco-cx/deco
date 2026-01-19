// compat/serve.ts
// HTTP server abstraction

import { isDeno, isBun } from "./detect.ts";

export interface ServeOptions {
  port: number;
  hostname?: string;
  onListen?: (addr: { hostname: string; port: number }) => void;
}

export type Handler = (request: Request) => Response | Promise<Response>;

export interface Server {
  shutdown(): Promise<void>;
}

declare const Deno: {
  serve(
    options: {
      port: number;
      hostname?: string;
      onListen?: (addr: { hostname: string; port: number }) => void;
    },
    handler: Handler,
  ): { shutdown(): Promise<void> };
};

declare const Bun: {
  serve(options: {
    port: number;
    hostname?: string;
    fetch: Handler;
  }): { stop(): void };
};

/**
 * Start an HTTP server using the native runtime API
 */
export const serve = async (
  handler: Handler,
  options: ServeOptions,
): Promise<Server> => {
  if (isDeno) {
    const server = Deno.serve(
      {
        port: options.port,
        hostname: options.hostname,
        onListen: options.onListen,
      },
      handler,
    );
    return { shutdown: () => server.shutdown() };
  }

  if (isBun) {
    const server = Bun.serve({
      port: options.port,
      hostname: options.hostname,
      fetch: handler,
    });
    options.onListen?.({
      hostname: options.hostname ?? "localhost",
      port: options.port,
    });
    return {
      shutdown: async () => {
        server.stop();
      },
    };
  }

  // Node.js - use built-in http server with fetch adapter
  const http = await import("node:http");

  return new Promise((resolve) => {
    // deno-lint-ignore no-explicit-any
    const server = http.createServer(async (req: any, res: any) => {
      try {
        const url = `http://${req.headers.host}${req.url}`;
        const headers = new Headers();

        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            headers.set(
              key,
              Array.isArray(value) ? value.join(", ") : String(value),
            );
          }
        }

        // Read body for non-GET/HEAD requests
        let body: ArrayBuffer | undefined;
        if (req.method !== "GET" && req.method !== "HEAD") {
          const chunks: Buffer[] = [];
          for await (const chunk of req) {
            chunks.push(chunk);
          }
          if (chunks.length > 0) {
            body = Buffer.concat(chunks);
          }
        }

        const request = new Request(url, {
          method: req.method,
          headers,
          body,
        });

        const response = await handler(request);

        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));

        const responseBody = await response.arrayBuffer();
        res.end(Buffer.from(responseBody));
      } catch (error) {
        console.error("Server error:", error);
        res.statusCode = 500;
        res.end("Internal Server Error");
      }
    });

    server.listen(options.port, options.hostname ?? "0.0.0.0", () => {
      options.onListen?.({
        hostname: options.hostname ?? "localhost",
        port: options.port,
      });
      resolve({
        shutdown: () =>
          new Promise<void>((res) => server.close(() => res())),
      });
    });
  });
};

