import { PageProps } from "$fresh/server.ts";
import { Page } from "../../../blocks/page.tsx";
import LiveControls from "../../../components/LiveControls.tsx";
import { Context } from "../../../deco.ts";
import { ComponentMetadata } from "../../../engine/block.ts";

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
function Preview(props: PageProps<Page>) {
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

export default Preview;
