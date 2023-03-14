import { newComponentBlock } from "$live/blocks/utils.ts";
import { InstanceOf } from "$live/engine/block.ts";

// @ts-ignore: "waiting for the engine to be completed"
export type IslandInstance = InstanceOf<typeof island, "#/root/islands">;

const island = newComponentBlock("islands");

/**
 * islands are 1-1 to fresh islands.
 */
export default island;
