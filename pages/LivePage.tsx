import { Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";

export interface Props {
  sections: Section[];
}

export default function LivePage({ sections }: Props) {
  const renderSection = (
    { Component: Section, props, metadata }: Props["sections"][0],
    idx: number,
  ) => {
    return (
      <section
        id={`${metadata?.component}-${idx}`}
        data-manifest-key={metadata?.component}
      >
        <Section {...props} />
      </section>
    );
  };
  return (
    <>
      <LiveAnalytics />
      <>{sections?.map(renderSection)}</>
    </>
  );
}
