import { SectionInstance } from "$live/blocks/section.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";

export interface Props {
  sections: SectionInstance[];
}
// FIXME MISSING UniqueID and Data-manifest-key

export default function LivePage({ sections }: Props) {
  const renderSection = ({ Component, props }: Props["sections"][0]) => {
    return (
      <section>
        <Component {...props} />
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
