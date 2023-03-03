// deno-lint-ignore-file no-explicit-any
import { HandlerContext, Manifest } from "$fresh/server.ts";
import blocks from "$live/blocks/index.ts";
import defaultResolvers from "$live/engine/adapters/fresh/defaults.ts";
import { useFileProvider } from "$live/engine/adapters/fresh/fileProvider.ts";
import { BlockModule } from "$live/engine/block.ts";
import { Rezolver } from "$live/engine/core/mod.ts";
import {
  BaseContext,
  Resolver,
  ResolverMap,
} from "$live/engine/core/resolver.ts";
import { mapObjKeys, PromiseOrValue } from "$live/engine/core/utils.ts";
import { context } from "$live/live.ts";
import { Schemas } from "./manifestBuilder.ts";
import { LiveConfig } from "$live/blocks/types.ts";

export type FreshHandler<
  TConfig = any,
  TData = any,
  TState = any,
  Resp = Response,
> = (
  request: Request,
  ctx: HandlerContext<TData, LiveConfig<TState, TConfig>>,
) => PromiseOrValue<Resp>;

export interface FreshContext<Data = any, State = any, TConfig = any>
  extends BaseContext {
  context: HandlerContext<Data, LiveConfig<State, TConfig>>;
  request: Request;
}

export interface DecoManifest extends Manifest {
  schemas: Schemas;
}

export type LiveState<T, TState = unknown> = TState & {
  $live: T;
};

export interface ConfigProvider {
  get<T>(id: string): T;
}

const asManifest = (
  d: DecoManifest,
): Record<string, Record<string, BlockModule>> =>
  d as unknown as Record<string, Record<string, BlockModule>>;
export const configurable = (m: DecoManifest): DecoManifest => {
  context.blocks = blocks;
  const [newManifest, resolvers] = (context.blocks ?? []).reduce(
    ([currMan, currMap], blk) => {
      const blocks = asManifest(currMan)[blk.type] ?? {};
      const decorated: Record<string, BlockModule> = blk.decorate
        ? mapObjKeys<Record<string, BlockModule>, Record<string, BlockModule>>(
          blocks,
          blk.decorate,
        )
        : blocks;

      const previews = Object.entries(decorated).reduce((prv, [key, mod]) => {
        const previewFunc = mod.preview ?? blk.defaultPreview;
        if (previewFunc) {
          return { ...prv, ["Preview@" + key]: previewFunc };
        }
        return prv;
      }, {} as ResolverMap);
      const adapted = blk.adapt
        ? mapObjKeys<Record<string, BlockModule>, Record<string, Resolver>>(
          decorated,
          blk.adapt,
        )
        : {}; // if block has no adapt so it's not considered a resolver.
      return [
        { ...currMan, [blk.type]: decorated },
        { ...currMap, ...adapted, ...previews },
      ];
    },
    [m, {}] as [DecoManifest, ResolverMap],
  );
  const provider = useFileProvider("./config.json");
  const resolver = new Rezolver<FreshContext>({
    resolvers: { ...resolvers, ...defaultResolvers },
    getResolvable: provider.get.bind(provider),
  });
  // should be set first
  context.configResolver = resolver;
  context.manifest = newManifest;

  return context.manifest;
};
