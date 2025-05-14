import { useEffect } from "preact/hooks";

interface Props {
  id: string;
}

export default function DispatchAsyncRender({ id }: Props) {
  useEffect(function clickOnAsyncRenderElements() {
    let timeout: number | undefined;

    function dispatch() {
      timeout = setTimeout(() => {
        const elem = document.getElementById(id);
        const parent = elem?.parentElement;

        if (elem == null || parent == null) {
          console.error(
            `Missing element of id ${id} or its parent element. Async rendering will NOT work properly`,
          );
          return;
        }

        elem.click();
      }, 6000);

      return () => clearTimeout(timeout);
    }

    if (document.readyState === "complete") {
      return dispatch();
    }

    document.addEventListener("DOMContentLoaded", dispatch);

    return () => {
      if (typeof timeout !== "undefined") {
        clearTimeout(timeout);
      }
      document.removeEventListener("DOMContentLoaded", dispatch);
    };
  }, []);

  return <div data-dispatch-async-render />;
}
