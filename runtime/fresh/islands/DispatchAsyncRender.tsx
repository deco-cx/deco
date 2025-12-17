import { useEffect } from "preact/hooks";

export type PartialTriggerMode = "load" | "threshold";

let triggerMode: "load" | "threshold" = "threshold";
export const getPartialTriggerMode = () => triggerMode;
export const setPartialTriggerMode = (newMode: PartialTriggerMode): void => {
  triggerMode = newMode;
};

interface Props {
  id: string;
  partialTriggerMode: PartialTriggerMode;
}

export default function DispatchAsyncRender({ id, partialTriggerMode }: Props) {
  useEffect(function observeAsyncRenderElements() {
    const elem = document.getElementById(id);
    const parent = elem?.parentElement;

    if (elem == null || parent == null) {
      console.error(
        `Missing element of id ${id} or its parent element. Async rendering will NOT work properly`,
      );
      return;
    }

    if (partialTriggerMode === "load") {
      elem.click();
      return;
    }

    // Since the button is hidden (display: none), we need to observe a visible element
    // We'll observe the parent element which contains the actual content
    const targetElement = parent;

    // Create intersection observer with 200px root margin
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Trigger the async render when element comes into view
            elem.click();
            // Disconnect observer after first trigger to avoid multiple calls
            observer.disconnect();
          }
        });
      },
      {
        rootMargin: "200px", // Trigger when element is 200px away from viewport
        threshold: 0, // Trigger as soon as any part of the element is visible
      },
    );

    // Start observing the parent element (which is visible)
    observer.observe(targetElement);

    // Cleanup function to disconnect observer
    return () => observer.disconnect();
  }, [id]);

  return <div data-dispatch-async-render />;
}
