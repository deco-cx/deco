import { InstanceOf } from "../engine/block.ts";
import { createSectionBlock } from "./section.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page = createSectionBlock(
  (component, ComponentFunc) => (props, { resolveChain }) => ({
    Component: (p) => <ComponentFunc {...p} />,
    props,
    metadata: { resolveChain, component },
  }),
  "pages",
);

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
