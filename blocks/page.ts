import { fromComponentFunc } from "$live/blocks/utils.ts";
import {
  Block,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";
import { introspectWith } from "$live/engine/introspect.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page: Block<ComponentFunc, PreactComponent> = {
  type: "pages",
  defaultPreview: (comp) => comp,
  adapt: fromComponentFunc,
  introspect: introspectWith({
    default: 0,
  }, true),
};

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
