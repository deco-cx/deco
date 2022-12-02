import type { ComponentChildren } from "preact";
import { PageProps } from "$fresh/server.ts";
import { context } from "$live/live.ts";
import { LivePageData } from "$live/types.ts";
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
  data,
  children,
}: PageProps<LivePageData | undefined> & {
  children?: ComponentChildren;
}) {
  const { page, flags } = data ?? {};
  const manifest = context.manifest!;
  const LiveControls = manifest.islands[`./islands/LiveControls.tsx`]?.default;

  return (
    <>
      <LiveAnalytics {...page} flags={flags!} />

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
            flags={flags}
            isProduction={context.isDeploy}
          />
        )
        : null}
    </>
  );
}
