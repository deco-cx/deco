import { PageProps } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import LiveControls from "$live/components/LiveControls.tsx";
import LivePolyfills from "$live/components/LivePolyfills.tsx";
import { context } from "$live/live.ts";

function Preview(props: PageProps<Page>) {
  const { data } = props;
  const pageParent =
    data?.metadata?.resolveChain[data?.metadata?.resolveChain.length - 2];

  return (
    <>
      <LivePolyfills />
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: pageParent || "-1",
        }}
      />
    </>
  );
}

export default Preview;
