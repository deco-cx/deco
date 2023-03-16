import { PageProps } from "$fresh/server.ts";
import { context } from "$live/live.ts";
import { LivePageData } from "$live/types.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveSections from "$live/components/LiveSections.tsx";
import LiveControls from "$live/components/LiveControls.tsx";
import type { ComponentChildren } from "preact";

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

  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={page}
        flags={flags}
      />

      <LiveAnalytics {...page} flags={flags!} />

      {children
        ? children
        : page
        ? <LiveSections {...page.data} />
        : <EmptyPage />}
    </>
  );
}
