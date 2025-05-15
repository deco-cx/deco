import { useEffect } from "preact/hooks";

interface Props {
  id: string;
}

export default function DispatchAsyncRender({ id }: Props) {
  useEffect(function clickOnAsyncRenderElements() {
    let timeout: number | undefined;

    function dispatch() {
      function click() {
        const elem = document.getElementById(id);
        const parent = elem?.parentElement;

        if (elem == null || parent == null) {
          console.error(
            `Missing element of id ${id} or its parent element. Async rendering will NOT work properly`,
          );
          return;
        }

        elem.click();
      }

      const self = document.getElementById(`${id}-dispatch-async-render`);
      if (self == null) {
        console.error(
          `Missing element of id ${id}-dispatch-async-render. Async rendering will NOT work properly`,
        );
        return;
      }
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            click();
            observer.disconnect();
            if (typeof timeout !== "undefined") {
              clearTimeout(timeout);
            }
          }
        },
        {
          rootMargin: "0px",
          threshold: 0.1,
        },
      );

      observer.observe(self);
      timeout = setTimeout(() => {
        observer.disconnect();
        click();
      }, 6000);

      return () => {
        observer.disconnect();
        clearTimeout(timeout);
      };
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

  return (
    <div
      id={`${id}-dispatch-async-render`}
      data-dispatch-async-render
    />
  );
}
