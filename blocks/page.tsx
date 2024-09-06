// deno-lint-ignore-file no-explicit-any
/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import type { Block, InstanceOf, ResolverLike } from "../engine/block.ts";
import { createSectionBlock, type SectionModule } from "./section.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

const page: Block<
  SectionModule<any, any, any, any>,
  ResolverLike<any>,
  string,
  any,
  any
> = createSectionBlock(
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
