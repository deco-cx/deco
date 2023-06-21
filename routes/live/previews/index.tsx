import { PageProps } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import LiveControls from "$live/components/LiveControls.tsx";
import LivePolyfills from "$live/components/LivePolyfills.tsx";
import { context } from "$live/live.ts";
import { pageIdFromMetadata } from "$live/pages/LivePage.tsx";

function Preview(props: PageProps<Page>) {
  const { data } = props;
  const pageId = pageIdFromMetadata(data?.metadata);

  return (
    <>
      <LivePolyfills />
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{ id: pageId }}
      />
    </>
  );
}

export default Preview;
