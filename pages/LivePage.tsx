import { Section } from "$live/blocks/section.ts";
import LiveControls from "$live/components/LiveControls.tsx";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import { context } from "$live/live.ts";
import { ComponentMetadata } from "$live/engine/block.ts";

export interface Props {
  sections: Section[];
  __metadata: ComponentMetadata;
}

// FIXME @author Marcos V. Candeia missing live controls
export default function LivePage({ sections, __metadata }: Props) {
  const renderSection = (
    { Component: Section, props, metadata }: Props["sections"][0],
  ) => {
    return (
      <section data-manifest-key={metadata?.resolver}>
        <Section {...props} />
      </section>
    );
  };
  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: __metadata?.resolveChain ? __metadata.resolveChain[0] : "",
        }}
      />
      <LiveAnalytics />
      <>{sections?.map(renderSection)}</>
    </>
  );
}
