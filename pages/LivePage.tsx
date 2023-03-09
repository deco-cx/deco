import { Section } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";

export interface Props {
  sections: Section[];
}
// FIXME MISSING UniqueID and Data-manifest-key

export default function LivePage({ sections }: Props) {
  const renderSection = (
    { Component: Section, props }: Props["sections"][0],
  ) => {
    return (
      <section>
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
