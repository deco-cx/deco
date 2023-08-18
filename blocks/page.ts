import section from "../blocks/section.ts";
import { InstanceOf } from "../engine/block.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page = { ...section, type: "pages" };

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
