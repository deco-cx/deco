import { Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import { context } from '$live/live.ts';
import { usePageContext } from '$live/routes/[...catchall].tsx';
import LiveControls from "../components/LiveControls.tsx";

export interface Props {
  sections: Section[];
}

export function renderSection(
  { Component: Section, props, metadata }: Props["sections"][0],
  idx: number,
) {
  return (
    <section
      id={`${metadata?.component}-${idx}`}
      data-manifest-key={metadata?.component}
    >
      <Section {...props} />
    </section>
  );
}

export default function LivePage({ sections }: Props) {
  const metadata = usePageContext()?.metadata;
  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: metadata?.id!,
        }}
      />
      <LiveAnalytics />
      <>{sections?.map(renderSection)}</>
    </>
  );
}
