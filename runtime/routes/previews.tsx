/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import type { Page } from "../../blocks/page.tsx";
import LiveControls from "../../components/LiveControls.tsx";
import { Context } from "../../deco.ts";
import type { ComponentMetadata } from "../../engine/block.ts";
import { createHandler } from "../middleware.ts";
import type { PageParams } from "../mod.ts";

const PAGE_NOT_FOUND = -1;
export const pageIdFromMetadata = (
  metadata: ComponentMetadata | undefined,
) => {
  if (!metadata) {
    return PAGE_NOT_FOUND;
  }

  const { resolveChain, component } = metadata;
  const pageResolverIndex =
    (resolveChain.findLastIndex((chain) =>
      chain.type === "resolver" && chain.value === component
    )) || PAGE_NOT_FOUND;

  const pageParent = pageResolverIndex > 0
    ? resolveChain[pageResolverIndex - 1]
    : null;

  return pageParent?.value ?? PAGE_NOT_FOUND;
};
function Preview(props: PageParams<Page>) {
  const { data } = props;
  const pageId = pageIdFromMetadata(data?.metadata);
  const context = Context.active();

  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{ id: pageId }}
      />
    </>
  );
}

export const handler = createHandler((ctx) => {
  return ctx.render({
    page: {
      Component: Preview,
      props: { options: { serverSideOnly: true } },
    },
  });
});
export default Preview;
