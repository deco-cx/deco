import { newComponentBlock } from "$live/blocks/utils.ts";
import { InstanceOf } from "$live/engine/block.ts";

// @ts-ignore: "waiting for the engine to be completed"
export type PageInstance = InstanceOf<typeof page, "#/root/pages">;

const page = newComponentBlock("pages");

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
