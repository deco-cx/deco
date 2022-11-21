import { context } from "$live/live.ts";
import { PageData } from "$live/types.ts";
import type { FunctionComponent } from "preact";

export default function LiveSections({ sections }: PageData) {
  const manifest = context.manifest!;
  return (
    <>
      {sections?.map(({ key, props, uniqueId }) => {
        const Component = manifest.sections[key]?.default as
          | FunctionComponent
          | undefined;

        if (!Component) {
          console.error(`Section not found ${key}`);

          return null;
        }

        return (
          <section id={uniqueId} data-manifest-key={key}>
            <Component {...props} />
          </section>
        );
      })}
    </>
  );
}
