import { fromComponentFunc } from "$live/blocks/utils.ts";
import {
  Block,
  BlockModule,
  ComponentFunc,
  InstanceOf,
  PreactComponent,
} from "$live/engine/block.ts";
import { JSX } from "preact";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page: Block<
  BlockModule<ComponentFunc, JSX.Element | null, PreactComponent>
> = {
  type: "pages",
  introspect: {
    default: "0",
  },
  adapt: fromComponentFunc,
  defaultPreview: (comp) => comp,
};

/**
 * (props:TProps) => JSX.Element
 * Pages are PreactComponents
 */
export default page;
