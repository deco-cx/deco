import { InstanceOf } from "$live/blocks/types.ts";
import { newComponentBlock } from "$live/blocks/utils.ts";

export type IslandInstance = InstanceOf<typeof island, "#/root/islands">;

const island = newComponentBlock("islands");

export default island;
