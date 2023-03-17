import { newComponentBlock } from "$live/blocks/utils.ts";
import { InstanceOf } from "$live/engine/block.ts";

export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

const sectionBlock = newComponentBlock("sections");

/**
 * (props:TProps) => JSX.Element
 * Section are PreactComponents
 */
export default sectionBlock;
