import section from "$live/blocks/section.ts";
import { InstanceOf } from "$live/engine/block.ts";

export type IslandInstance = InstanceOf<typeof island, "#/root/islands">;

const island = { ...section, type: "islands" };

/**
 * islands are 1-1 to fresh islands.
 */
export default island;
