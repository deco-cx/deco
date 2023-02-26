import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import { Page } from "$live/blocks/page.ts";
import { PreactComponent } from "$live/blocks/types.ts";
import { Section } from "$live/blocks/section.ts";

export interface Props {
  sections: PreactComponent<Section>[];
}
// FIXME MISSING UniqueID and Data-manifest-key

export default function LivePage({ sections }: Props): Page {
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
