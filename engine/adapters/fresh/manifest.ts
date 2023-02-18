// deno-lint-ignore-file no-explicit-any
import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Rezolver } from "../../core/mod.ts";
import { mapObjKeys } from "../../core/utils.ts";
import { PromiseOrValue } from "../../core/utils.ts";
import {
  componentAdapter,
  ComponentFunc,
  FreshContext,
  FreshHandler,
  loaderAdapter,
} from "./adapters.ts";

type RouteWithHandler<TConfig = any, TData = any, TState = any> = {
  default?: ComponentFunc<PageProps<any>>;
  handler?: FreshHandler<TConfig, TData, TState>;
};

type PageRoute<TConfig = any> = {
  default?: ComponentFunc<PageProps<TConfig>>;
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

interface FreshManifest {
  routes: Routes;
}

export interface LiveConfig<T> {
  $config: T;
}
export type Loader<T = any, TConfig = any, TData = any, TState = any> = (
  req: Request,
  ctx: HandlerContext<TData, TState & LiveConfig<TConfig>>
) => PromiseOrValue<T>;

export interface Resolvers {
  loaders: Record<string, Loader>;
  sections: Record<string, ComponentFunc>;
}

export interface ConfigProvider {
  get<T>(id: string): T;
}

export const configurable = <T extends FreshManifest>(
  m: T,
  provider: ConfigProvider,
  { loaders, sections }: Resolvers = {
    loaders: {},
    sections: {},
  }
): T => {
  const resolver = new Rezolver<FreshContext>({
    resolvers: {
      ...mapObjKeys(loaders, loaderAdapter),
      ...mapObjKeys(sections, componentAdapter),
    },
    getResolvable: provider.get.bind(provider),
  });
  const routes = mapObjKeys<Routes, Routes>(m.routes, (route, key) => {
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
        const $config = await resolver.resolve(key, {
          context,
          request,
        });
        return route.handler!(request, {
          ...context,
          state: { ...context.state, $config },
        });
      },
    };
  });
  return { ...m, routes };
};
