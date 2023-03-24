import { fromComponentFunc } from "$live/blocks/utils.ts";
import {
  Block,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page: Block<ComponentFunc, PreactComponent> = {
  type: "pages",
  introspect: {
    default: 0,
  },
  adapt: fromComponentFunc,
  defaultPreview: (comp) => comp,
};

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
