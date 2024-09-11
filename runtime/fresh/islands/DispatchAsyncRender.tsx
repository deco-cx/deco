import { useEffect } from "preact/hooks";

interface Props {
  id: string;
}

export default function DispatchAsyncRender({ id }: Props) {
  useEffect(function clickOnAsyncRenderElements() {
    const elem = document.getElementById(id);
    const parent = elem?.parentElement;

    if (elem == null || parent == null) {
      console.error(
        `Missing element of id ${id} or its parent element. Async rendering will NOT work properly`,
      );
      return;
    }

    elem.click();
  }, []);

  return <div data-dispatch-async-render />;
}
