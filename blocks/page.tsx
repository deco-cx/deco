/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import type { Block, InstanceOf, ResolverLike } from "../engine/block.ts";
import { createSectionBlock, type SectionModule } from "./section.ts";

export type Page = InstanceOf<typeof page, "#/root/pages">;

/**
 * Creates a new Block object for a section within a component or page.
 *
 * @param {any} component - The component or element to be used in the section.
 * @param {Function} ComponentFunc - A function that renders the component.
 * @returns {Block<SectionModule<any, any, any, any>, ResolverLike<any>, string, any, any>}
 *   A Block object with properties:
 *   - `Component`: The rendered component.
 *   - `props`: Props passed to the component.
 *   - `metadata`: Metadata about the section, including `resolveChain` and `component`.
 */
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
