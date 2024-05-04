import { PreactComponent } from "../engine/block.ts";

export type MetabaseProps = {
  url: string;
};

export const metabasePreview = (iframeSrc: string): PreactComponent => ({
  Component: () => (
    <iframe
      style={"min-width: 100vw; min-height: 100vh;"}
      src={`${iframeSrc}#bordered=false&titled=false`}
    />
  ),
  props: {},
  metadata: {
    resolveChain: [],
    component: "",
  },
});
