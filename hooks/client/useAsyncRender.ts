import { IS_BROWSER } from "$fresh/runtime.ts";

const ASYNC_RENDER_TRIGGER = "async-render-trigger";

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
