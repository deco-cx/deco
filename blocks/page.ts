import {
  fromComponentFunc,
  instrospectComponentFunc,
} from "$live/blocks/utils.ts";
import {
  Block,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page: Block<ComponentFunc, PreactComponent> = {
  type: "pages",
  defaultPreview: (comp) => comp,
  adapt: fromComponentFunc,
  introspect: instrospectComponentFunc("./pages"),
};

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
