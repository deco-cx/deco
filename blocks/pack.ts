import { applyConfigSync } from "$live/blocks/utils.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { DecoManifest } from "$live/types.ts";

export type Pack = InstanceOf<typeof packBlock, "#/root/packs">;

// deno-lint-ignore no-explicit-any
export type PackF<State = any> = (c: State) => DecoManifest;

const packBlock: Block<BlockModule<PackF>> = {
  type: "packs",
  introspect: {
    default: "0",
  },
  adapt: applyConfigSync,
};

/**
 * <TState>(state:TState) => Manifest
 * The pack block is used to configure platforms using settings
 */
export default packBlock;
