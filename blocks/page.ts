import { InstanceOf } from "$live/blocks/types.ts";
import { newComponentBlock } from "$live/blocks/utils.ts";

export type PageInstance = InstanceOf<typeof page, "#/root/pages">;

const page = newComponentBlock("pages");

export default page;
