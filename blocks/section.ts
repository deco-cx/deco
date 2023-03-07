import { InstanceOf } from "$live/blocks/types.ts";
import { newComponentBlock } from "$live/blocks/utils.ts";

export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

const sectionBlock = newComponentBlock("sections");

export default sectionBlock;
