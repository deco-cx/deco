import { newComponentBlock } from "$live/blocks/utils.ts";
import { InstanceOf } from "$live/engine/block.ts";

// @ts-ignore: "waiting for the engine to be completed"
export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

const sectionBlock = newComponentBlock("sections");

export default sectionBlock;
