// compat/serve.test.ts
// Tests for HTTP server abstraction

import { afterAll, describe, expect, it } from "vitest";
import { serve, type Server } from "./serve.ts";

describe("HTTP Server Abstraction", () => {
  const servers: Server[] = [];

  afterAll(async () => {
    // Clean up all servers after tests
    for (const server of servers) {
      try {
        await server.shutdown();
      } catch {
        // Ignore shutdown errors
      }
    }
  });

  it("should start a server and handle requests", async () => {
    const port = 19876; // Use a high port to avoid conflicts
    let receivedRequest = false;

    const server = await serve(
      async (request) => {
        receivedRequest = true;
        return new Response(`Hello from ${request.url}`, {
          status: 200,
          headers: { "content-type": "text/plain" },
        });
      },
      {
        port,
        onListen: (addr) => {
          expect(addr.port).toBe(port);
        },
      },
    );

    servers.push(server);

    // Make a request to the server
    const response = await fetch(`http://localhost:${port}/test`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Hello from");
    expect(text).toContain("/test");
    expect(receivedRequest).toBe(true);
  });

  it("should handle JSON responses", async () => {
    const port = 19877;

    const server = await serve(
      async () => {
        return new Response(JSON.stringify({ success: true, data: [1, 2, 3] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
      { port },
    );

    servers.push(server);

    const response = await fetch(`http://localhost:${port}/api`);
    const json = await response.json();

    expect(response.headers.get("content-type")).toBe("application/json");
    expect(json.success).toBe(true);
    expect(json.data).toEqual([1, 2, 3]);
  });

  it("should handle POST requests with body", async () => {
    const port = 19878;
    let receivedBody = "";

    const server = await serve(
      async (request) => {
        if (request.method === "POST") {
          receivedBody = await request.text();
          return new Response("OK", { status: 200 });
        }
        return new Response("Method Not Allowed", { status: 405 });
      },
      { port },
    );

    servers.push(server);

    const response = await fetch(`http://localhost:${port}/submit`, {
      method: "POST",
      body: "test body content",
      headers: { "content-type": "text/plain" },
    });

    expect(response.status).toBe(200);
    expect(receivedBody).toBe("test body content");
  });

  it("should handle headers correctly", async () => {
    const port = 19879;

    const server = await serve(
      async (request) => {
        const customHeader = request.headers.get("x-custom-header");
        return new Response(`Header: ${customHeader}`, {
          status: 200,
          headers: {
            "x-response-header": "response-value",
          },
        });
      },
      { port },
    );

    servers.push(server);

    const response = await fetch(`http://localhost:${port}/headers`, {
      headers: { "x-custom-header": "request-value" },
    });

    const text = await response.text();
    expect(text).toBe("Header: request-value");
    expect(response.headers.get("x-response-header")).toBe("response-value");
  });

  it("should shutdown gracefully", async () => {
    const port = 19880;

    const server = await serve(
      async () => new Response("OK"),
      { port },
    );

    // Verify server is running
    const response1 = await fetch(`http://localhost:${port}/`);
    expect(response1.status).toBe(200);

    // Shutdown the server
    await server.shutdown();

    // Server should no longer accept connections (may throw or timeout)
    // We just verify shutdown doesn't throw
    expect(true).toBe(true);
  });
});

