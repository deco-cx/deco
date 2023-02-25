// deno-lint-ignore-file no-explicit-any
import { HandlerContext, Manifest } from "$fresh/server.ts";
import { useFileProvider } from "$live/engine/adapters/fresh/fileProvider.ts";
import { Rezolver } from "$live/engine/core/mod.ts";
import { BaseContext, ResolverMap } from "$live/engine/core/resolver.ts";
import { mapObjKeys, PromiseOrValue } from "$live/engine/core/utils.ts";
import {
  AppModule,
  ErrorPageModule,
  Handler,
  Handlers,
  MiddlewareModule,
  RouteModule,
  UnknownPageModule,
} from "https://deno.land/x/fresh@1.1.2/src/server/types.ts";

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response,
> = (
  request: Request,
  ctx: HandlerContext<TData, TState & { $live: TConfig }>,
) => PromiseOrValue<Resp>;

export interface FreshContext<Data = any, State = any> extends BaseContext {
  context: HandlerContext<Data, State>;
  request: Request;
}

const isRouteModule = (
  key: string,
  _:
    | RouteModule
    | MiddlewareModule
    | AppModule
    | ErrorPageModule
    | UnknownPageModule,
): _ is RouteModule | AppModule => {
  return !key.startsWith("./routes/_");
};

const _isUnknownPageModule = (
  key: string,
  _:
    | RouteModule
    | MiddlewareModule
    | AppModule
    | ErrorPageModule
    | UnknownPageModule,
): _ is UnknownPageModule => {
  return key === "./routes/_404.ts";
};

const _isErrorPageModule = (
  key: string,
  _:
    | RouteModule
    | MiddlewareModule
    | AppModule
    | ErrorPageModule
    | UnknownPageModule,
): _ is ErrorPageModule => {
  return key.startsWith("./routes/_500.ts");
};

const _isMiddlewareModule = (
  key: string,
  _:
    | RouteModule
    | MiddlewareModule
    | AppModule
    | ErrorPageModule
    | UnknownPageModule,
): _ is MiddlewareModule => {
  return key === "./routes/_middleware.ts";
};

type Routes = Manifest["routes"];

export interface DecoManifest extends Manifest {
  definitions?: Record<string, unknown>;
}

export type LiveState<T, TState = unknown> = TState & {
  $live: T;
};

export interface ConfigProvider {
  get<T>(id: string): T;
}

const mapHandlers = (
  key: string,
  rz: Rezolver<FreshContext>,
  handlers: Handler<any, any> | Handlers<any, any>,
): Handler<any, any> | Handlers<any, any> => {
  if (typeof handlers === "object") {
    return mapObjKeys(handlers, (val) => {
      return async function (request: Request, context: HandlerContext) {
        const $live = await rz.resolve(key, {
          context,
          request,
        });
        return val!(request, {
          ...context,
          state: { ...context.state, $live },
        });
      };
    });
  }
  return async function (request: Request, context: HandlerContext) {
    const $live = (await rz.resolve(key, {
      context,
      request,
    })) ?? {};
    if (typeof handlers === "function") {
      return handlers(request, {
        ...context,
        state: { ...context.state, $live },
      });
    }
    return context.render($live);
  };
};
export const configurable = (m: DecoManifest): DecoManifest => {
  const { islands, routes: _ignore, definitions } = m;
  const resolvers = (Object.values(m) as ResolverMap[]).reduce(
    (r, rm) => ({ ...r, ...rm }),
    {} as ResolverMap,
  );
  const provider = useFileProvider("./config.json");
  const resolver = new Rezolver<FreshContext>({
    resolvers,
    getResolvable: provider.get.bind(provider),
  });
  const routes = mapObjKeys<Routes, Routes>(m.routes ?? {}, (route, key) => {
    if (isRouteModule(key, route)) {
      const routeMod = route as RouteModule;
      const handl = routeMod.handler;
      return {
        ...route,
        handler: handl
          ? mapHandlers(
            (routeMod.config as { liveKey: string }).liveKey ?? key,
            resolver,
            handl,
          )
          : undefined,
      };
    }
    return route;
  });
  return { ...m, routes, islands, definitions } as DecoManifest;
};
