import { Plugin } from "$fresh/server.ts";
import { context } from "$live/live.ts";
import { options } from "preact";
import { ConnInfo } from "std/http/server.ts";
import { Handler } from "../blocks/handler.ts";

// Store previous hook
const oldHook = options.vnode;

export const loadersWarmUpPlugin = (): Plugin => {
  // Set our own options hook
  let links: Record<string, boolean> = {};
  options.vnode = (vnode) => {
    const href = (vnode?.props as { href?: string })?.href;
    if (vnode.type === "a" && href && href.startsWith("/")) {
      links[href] = true;
    }

    // Call previously defined hook if there was any
    if (oldHook) {
      oldHook(vnode);
    }
  };
  return {
    name: "loadersWarmUp",
    render(ctx) {
      links = {};
      ctx.render();
      const resolver = context.configResolver!.resolverFor({
        context: {},
        request: new Request("http://localhost:8000"),
      });
      resolver<{ handler: Handler }>("./routes/[...catchall].tsx").then(
        async ({ handler: h }) => {
          for (const href of Object.keys(links)) {
            const req = new Request(`http://localhost:8000${href}?warmup`);
            const s = await h(
              req,
              { state: { global: {} } } as ConnInfo & { state: unknown },
            );
            console.log(s);
          }
        },
      );

      return {};
    },
  };
};
