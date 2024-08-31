import { type Options as SO, useSection } from "./useSection.ts";

const CLIENT_NAV_ATTR = "f-client-nav";
const PARTIAL_ATTR = "f-partial";

interface Options<P> extends SO<P> {
  mode?: "replace" | "append" | "prepend";
}

interface PartialSectionReturnType {
  [CLIENT_NAV_ATTR]: boolean;
  [PARTIAL_ATTR]: string;
}

export const usePartialSection = <P>(
  props: Options<P> = {},
): PartialSectionReturnType => ({
  [CLIENT_NAV_ATTR]: true,
  [PARTIAL_ATTR]: `${useSection(props)}&fresh-partial=true&partialMode=${
    props.mode || "replace"
  }`,
});
