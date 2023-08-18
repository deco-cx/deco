import { PageProps } from "$fresh/server.ts";
import { Page } from "../../../blocks/page.ts";
import LiveControls from "../../../components/LiveControls.tsx";
import { context } from "../../../live.ts";
import { pageIdFromMetadata } from "../../../pages/LivePage.tsx";

function Preview(props: PageProps<Page>) {
  const { data } = props;
  const pageId = pageIdFromMetadata(data?.metadata);

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
