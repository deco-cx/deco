import { MiddlewareHandler, Plugin } from "$fresh/server.ts";
import { buildLiveState } from "$live/blocks/route.ts";
import { handler as decoMiddleware } from "$live/routes/_middleware.ts";

export default function decoPlugin(): Plugin {
  return {
    name: "deco",
    middlewares: [
      {
        path: "/",
        middleware: {
          handler: [
            buildLiveState,
            decoMiddleware,
          ] as MiddlewareHandler<Record<string, unknown>>[],
        },
      },
    ],
    routes: [
      {
        path: "/live/_meta",
      },
      {
        path: "/live/editorData",
      },
      {
        path: "/live/release",
      },
      {
        path: "/live/workbench",
      },
      {
        path: "/live/inspect/[...block]",
      },
      {
        path: "/live/invoke",
      },
      {
        path: "/live/invoke/[...key]",
      },
      {
        path: "/live/previews",
      },
      {
        path: "/live/previews/[...block]",
      },
      {
        path: "/workflows/run",
      },
    ],
  };
}
