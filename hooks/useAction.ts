import { usePartialSection } from "./usePartialSection.ts";

/**
 * @returns the action url of the current section.
 */
export const useAction = () => {
  return usePartialSection()["f-partial"];
};
