// deno-lint-ignore-file no-explicit-any
import { HandlerContext, Manifest } from "$fresh/server.ts";
import defaultResolvers from "$live/engine/adapters/fresh/defaults.ts";
import { useFileProvider } from "$live/engine/adapters/fresh/fileProvider.ts";
import { Rezolver } from "$live/engine/core/mod.ts";
import { BaseContext, ResolverMap } from "$live/engine/core/resolver.ts";
import { PromiseOrValue } from "$live/engine/core/utils.ts";
import { context } from "$live/live.ts";

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response
> = (
  request: Request,
  ctx: HandlerContext<TData, TState & { $live: TConfig }>
) => PromiseOrValue<Resp>;

export interface FreshContext<Data = any, State = any> extends BaseContext {
  context: HandlerContext<Data, State>;
  request: Request;
}

export interface DecoManifest extends Manifest {
  definitions: Record<
    string,
    { inputSchema: unknown; outputSchema: unknown } | any
  >;
}

export type LiveState<T, TState = unknown> = TState & {
  $live: T;
};

export interface ConfigProvider {
  get<T>(id: string): T;
}

export const configurable = (m: DecoManifest): DecoManifest => {
  const {
    islands: _islands,
    routes: _routes,
    definitions: _definitions,
    baseUrl: _baseUrl,
    config: _config,
    ...rest
  } = m;
  const resolvers = (Object.values(rest) as ResolverMap[]).reduce(
    (r, rm) => ({ ...r, ...rm }),
    {} as ResolverMap
  );
  const provider = useFileProvider("./config.json");
  const resolver = new Rezolver<FreshContext>({
    resolvers: { ...resolvers, ...defaultResolvers },
    getResolvable: provider.get.bind(provider),
  });
  // should be set first
  context.configResolver = resolver;
  context.manifest = m as DecoManifest;

  return context.manifest;
};
