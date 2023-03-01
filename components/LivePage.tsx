import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import { PreactComponent } from "$live/blocks/types.ts";
import { SectionInstance } from "$live/blocks/section.ts";

export interface Props {
  sections: PreactComponent<SectionInstance>[];
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
