import { context } from "$live/live.ts";
import { PageData } from "$live/types.ts";
import type { FunctionComponent } from "preact";

export default function LiveSections({ sections }: PageData) {
  const manifest = context.manifest!;

  const renderSection = ({ key, props, uniqueId }: PageData["sections"][0]) => {
    const childrenDefinition = props?.children as
      | PageData["sections"]
      | null;

    const children = Array.isArray(childrenDefinition)
      ? <>{childrenDefinition?.map(renderSection)}</>
      : null;

    const Component = manifest.sections[key]?.default as
      | FunctionComponent
      | undefined;

    if (!Component) {
      console.error(`Section not found ${key}`);

      return null;
    }

    return (
      <section id={uniqueId} data-manifest-key={key}>
        <Component {...props} children={children} />
      </section>
    );
  };

  return <>{sections?.map(renderSection)}</>;
}
