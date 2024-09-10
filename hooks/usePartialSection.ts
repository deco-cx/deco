import { IS_BROWSER } from "$fresh/runtime.ts";
import { type Options as SO, useSection } from "./useSection.ts";

const CLIENT_NAV_ATTR = "f-client-nav";
const PARTIAL_ATTR = "f-partial";
const ASYNC_RENDER_TRIGGER = "async-render-trigger";

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

interface AsyncRenderAttrs {
  /** @description property to mark async render HTML elements to be used in query selectors.  */
  "async-render-trigger": true;
}

/** Creates Async Render props for components. */
export const useAsyncRenderAttributes = (): AsyncRenderAttrs => ({
  [ASYNC_RENDER_TRIGGER]: true,
});

/** Click on all async render elements in the page.
 * Usefull to run in islands
 */
export const clickOnAsyncRenderElements = (): void => {
  IS_BROWSER &&
    document.querySelectorAll(`[${ASYNC_RENDER_TRIGGER}]`)
      .forEach((button) => (button as HTMLButtonElement).click());
};
