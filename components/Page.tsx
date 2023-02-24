import { Section } from "$live/blocks/section.ts";
import { Page } from "$live/blocks/page.ts";
import { PageProps } from "$fresh/server.ts";
import { PreactComponent } from "$live/blocks/loader.ts";

export interface Props {
  sections: PreactComponent<Section>[];
}
export default function Page(p: Props): Page {
  return <div>{p.sections.map((s) => <s></s>)}</div>;
}
