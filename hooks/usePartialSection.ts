import { type Options as SO, useSection } from "./useSection.ts";

const CLIENT_NAV_ATTR = "f-client-nav";
const PARTIAL_ATTR = "f-partial";

interface Options<P> extends SO<P> {
  mode?: "replace" | "append" | "prepend";
}

interface PartialSectionAttrs {
  "f-client-nav": boolean;
  "f-partial": string;
}

/**
 * Hook to create attributes for a partial section component.
 *
 * @template P - Type of the partial section props
 * @param {Options<P>} props - Optional props for the partial section.
 * @returns {PartialSectionAttrs} An object containing attributes for the partial section.
 */
export const usePartialSection = <P>(
  props: Options<P> = {},
): PartialSectionAttrs => ({
  [CLIENT_NAV_ATTR]: true,
  [PARTIAL_ATTR]: `${useSection(props)}&fresh-partial=true&partialMode=${
    props.mode || "replace"
  }`,
});
