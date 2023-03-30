import { newComponentBlock } from "$live/blocks/utils.ts";
import StubSection from "$live/components/StubSection.tsx";
import { InstanceOf } from "$live/engine/block.ts";

export type Section = InstanceOf<typeof sectionBlock, "#/root/sections">;

const sectionBlock = newComponentBlock("sections", (_, ctx) => {
  return {
    Component: StubSection,
    props: {
      component: ctx.resolveChain[ctx.resolveChain.length - 1],
    },
  };
});

/**
 * (props:TProps) => JSX.Element
 * Section are PreactComponents
 */
export default sectionBlock;
