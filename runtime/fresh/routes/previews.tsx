import { PageProps } from "$fresh/server.ts";
import { Page } from "../../../blocks/page.tsx";
import LiveControls from "../../../components/LiveControls.tsx";
import { Context } from "../../../deco.ts";
import { pageIdFromMetadata } from "../../../pages/LivePage.tsx";

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
