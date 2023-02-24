// deno-lint-ignore-file no-explicit-any
import { HandlerContext, PageProps } from "$fresh/server.ts";
import {
  ComponentFunc,
  FreshContext,
  FreshHandler,
} from "$live/engine/adapters/fresh/adapters.ts";
import { Rezolver } from "$live/engine/core/mod.ts";
import { mapObjKeys } from "$live/engine/core/utils.ts";
import { ResolverMap } from "../../core/resolver.ts";
import { useFileProvider } from "./fileProvider.ts";

type RouteWithHandler<TConfig = any, TData = any, TState = any> = {
  default?: ComponentFunc<any, PageProps<any>>;
  handler?: FreshHandler<TConfig, TData, TState>;
};

type PageRoute<TConfig = any> = {
  default?: ComponentFunc<any, PageProps<TConfig>>;
};

function hasHandler<TConfig = any, TData = any, TState = any>(
  v: RouteWithHandler<TConfig, TData, TState> | PageRoute<TConfig>
): v is RouteWithHandler<TConfig, TData, TState> {
  return (v as RouteWithHandler<TConfig, TData, TState>).handler !== undefined;
}
type FreshRoute<TConfig = any, TData = any, TState = any> =
  | RouteWithHandler<TConfig, TData, TState>
  | PageRoute<TConfig>;

type Routes = Record<string, FreshRoute>;

export type DecoManifest = {
  routes?: Routes;
  islands?: unknown;
  definitions?: unknown;
};

export type LiveState<T, TState = unknown> = TState & {
  $live: T;
};

export interface ConfigProvider {
  get<T>(id: string): T;
}

export const configurable = (m: DecoManifest): DecoManifest => {
  const { islands, routes: _ignore, definitions } = m;
  const resolvers = (Object.values(m) as ResolverMap[]).reduce(
    (r, rm) => ({ ...r, ...rm }),
    {} as ResolverMap
  );
  const provider = useFileProvider("./config.json");
  const resolver = new Rezolver<FreshContext>({
    resolvers,
    getResolvable: provider.get.bind(provider),
  });
  const routes = mapObjKeys<Routes, Routes>(m.routes ?? {}, (route, key) => {
    if (!hasHandler(route)) {
      return {
        default: route.default,
        handler: async (request: Request, context: HandlerContext) => {
          return context.render(
            await resolver.resolve(key, {
              context,
              request,
            })
          );
        },
      };
    }
    return {
      default: route.default,
      handler: async (request: Request, context: HandlerContext) => {
        const $live = await resolver.resolve(key, {
          context,
          request,
        });
        return route.handler!(request, {
          ...context,
          state: { ...context.state, $live },
        });
      },
    };
  });
  return { ...m, routes, islands, definitions } as DecoManifest;
};
