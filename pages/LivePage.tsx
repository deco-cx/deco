import { Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveControls from "$live/components/LiveControls.tsx";
import { context } from "$live/live.ts";
import { usePageMetadata } from "$live/routes/[...catchall].tsx";

export interface Props {
  sections: Section[];
}

export default function LivePage({ sections }: Props) {
  const metadata = usePageMetadata();
  const renderSection = (
    { Component: Section, props, metadata }: Props["sections"][0],
  ) => {
    return (
      <section data-manifest-key={metadata?.component}>
        <Section {...props} />
      </section>
    );
  };
  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: metadata?.resolveChain ? metadata.resolveChain[0] : "",
        }}
      />
      <LiveAnalytics />
      <>{sections?.map(renderSection)}</>
    </>
  );
}
