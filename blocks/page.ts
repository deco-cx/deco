import { newComponentBlock } from "$live/blocks/utils.ts";
import { InstanceOf } from "$live/engine/block.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page = newComponentBlock("pages");

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
