import { InstanceOf } from "../engine/block.ts";
import { createSectionBlock } from "deco/blocks/section.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page = createSectionBlock(
  (_, ComponentFunc) => (props) => ({
    Component: (p) => <ComponentFunc {...p} />,
    props,
  }),
  "pages",
);

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
