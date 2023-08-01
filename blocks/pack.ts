// deno-lint-ignore-file no-explicit-any
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { hydrateDocCacheWith } from "$live/engine/schema/docCache.ts";
import { DecoManifest } from "$live/types.ts";
import { SyncOnce, once } from "$live/utils/sync.ts";

export type Pack = InstanceOf<typeof packBlock, "#/root/packs">;

export type PackF<State = any, TManifest extends DecoManifest = any> = (
  c: State,
) => TManifest;

export interface PackModule extends BlockModule<PackF> {
  name?: string;
}
const hydrateOnce: Record<string, SyncOnce<void>> = {};
const packBlock: Block<PackModule> = {
  type: "packs",
  introspect: {
    default: "0",
  },
  adapt: <
    TConfig = any,
  >({ default: fn, name }: {
    default: PackF;
    name?: string;
  }) =>
  (state: TConfig) => {
    if (!name) {
      throw new Error(
        "packs without a name is not support yet",
      );
    }
    const baseKey = import.meta.resolve(name);
    hydrateOnce[name] ??= once<void>();
    hydrateOnce[name].do(() => {
      return hydrateDocCacheWith(`${baseKey}/doccache.zst`, (key: string) => {
        if (key.startsWith("http")) {
          return key;
        }
        return `${baseKey}/${key}`;
      });
    });
    return fn(state);
  },
};

/**
 * <TState>(state:TState) => Manifest
 * The pack block is used to configure platforms using settings
 */
export default packBlock;
