import { Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";

export interface Props {
  sections: Section[];
}
// FIXME MISSING UniqueID

export default function LivePage({ sections }: Props) {
  const renderSection = (
    { Component: Section, props, key }: Props["sections"][0],
  ) => {
    return (
      <section data-manifest-key={key}>
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
