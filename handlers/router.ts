import { Handler } from "$live/blocks/handler.ts";
import { router } from "https://deno.land/x/rutt@0.0.13/mod.ts";

export interface RouterConfig {
  base?: string;
  routes: Record<string, Handler>;
}

export default function Router({
  routes: entrypoints,
  base,
}: RouterConfig): Handler {
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
  return serve;
}
