import { Plugin } from "$fresh/server.ts";

export default function decoPlugin(): Plugin {
  return {
    name: "deco",
    middlewares: [
      {
        path: "*",
        middleware: {
          handler: (_req, ctx) => {
            console.log("CALLED");
            return ctx.next();
          },
        },
      },
    ],
  };
}
