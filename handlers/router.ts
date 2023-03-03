import { HandlerInstance } from "$live/blocks/handler.ts";
import { HandlerContext } from "https://deno.land/x/fresh@1.1.2/server.ts";
import { router } from "https://deno.land/x/rutt@0.0.13/mod.ts";

export interface RouterConfig {
  base?: string;
  routes: Record<string, HandlerInstance>;
}

export default function Router({ routes: entrypoints, base }: RouterConfig) {
  return (req: Request, ctx: HandlerContext) => {
    let routes = entrypoints;

    if (base) {
      routes = {};
      for (const [entrypoint, handler] of Object.entries(entrypoints)) {
        routes = {
          ...routes,
          [`${base}${entrypoint}`]: handler,
        };
      }
    }

    const serve = router(routes);
    return serve(req, ctx);
  };
}
