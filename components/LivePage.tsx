import type { ComponentChildren } from "preact";
import { PageProps } from "$fresh/server.ts";
import { context } from "$live/live.ts";
import { Page } from "$live/types.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveSections from "$live/components/LiveSections.tsx";

const EmptyPage = () => (
  <div>
    <h1>No page here :(</h1>
    <p>Let's create one!</p>
    <button>Add Section</button>
  </div>
);

export default function LivePage({
  data: page,
  children,
}: PageProps<Page | undefined> & {
  children?: ComponentChildren;
}) {
  const manifest = context.manifest!;
  // TODO: Read this from context
  const LiveControls = !context.isDeploy &&
    manifest.islands[`./islands/LiveControls.tsx`]?.default;

  return (
    <>
      <LiveAnalytics {...page} />

      {children
        ? children
        : page
        ? <LiveSections {...page.data} />
        : <EmptyPage />}

      {LiveControls
        ? (
          <LiveControls
            site={{ id: context.siteId, name: context.site }}
            page={page}
            isProduction={context.isDeploy}
          />
        )
        : null}
    </>
  );
}
