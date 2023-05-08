import { Plugin } from "$fresh/server.ts";
import { options } from "preact";
import { singleFlight } from "../engine/core/utils.ts";
import { routerCtx } from "../routes/[...catchall].tsx";
import { RouterContext } from "../types.ts";

// Store previous hook
const oldHook = options.vnode;
const sf = singleFlight();

export const loadersWarmUpPlugin = (): Plugin => {
  // Set our own options hook
  let links: Record<string, boolean> = {};
  let servePath: ((url: string) => Promise<Response>) | null = null;

  options.vnode = (vnode) => {
    if (vnode.type === routerCtx.Provider) {
      servePath = (vnode.props as { value?: RouterContext })
        ?.value?.servePath ?? null;
    }
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
      servePath = null as (typeof servePath);
      ctx.render();
      if (servePath) {
        for (const link of Object.keys(links)) {
          sf.do(link, () => servePath!(link));
        }
      }

      return {};
    },
  };
};
