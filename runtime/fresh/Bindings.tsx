import { Head, Partial } from "$fresh/runtime.ts";
import type { Framework } from "../../components/section.tsx";
import { usePartialSection } from "../../hooks/usePartialSection.ts";

const script = (id: string) => {
  function init() {
    const elem = document.getElementById(id);
    const parent = elem?.parentElement;

    if (elem == null || parent == null) {
      console.error(
        `Missing element of id ${id} or its parent element. Async rendering will NOT work properly`,
      );
      return;
    }

    const observeAndClose = (e: IntersectionObserverEntry[]) => {
      e.forEach((entry) => {
        if (entry.isIntersecting) {
          elem.click();
          observer.disconnect();
        }
      });
    };
    const observer = new IntersectionObserver(observeAndClose);
    observer.observe(parent);
    observeAndClose(observer.takeRecords());
  }

  if (document.readyState === "complete") {
    init();
  } else {
    addEventListener("load", init);
  }
};

const dataURI = (fn: typeof script, id: string) =>
  btoa(
    `decodeURIComponent(escape(${
      unescape(encodeURIComponent(`((${fn})("${id}"))`))
    }))`,
  );

const bindings: Framework = {
  Wrapper: ({ id, partialMode, children }) => (
    <Partial name={id} mode={partialMode}>{children}</Partial>
  ),
  LoadingFallback: ({ id, children }) => {
    const btnId = `${id}-partial-onload`;
    const { "f-partial": href, ...rest } = usePartialSection();

    return (
      <>
        <Head>
          <link rel="prefetch" href={href} as="document" />
        </Head>
        <button
          f-partial={href}
          {...rest}
          id={btnId}
          style={{ display: "none" }}
        />
        <script
          defer
          src={`data:text/javascript;base64,${dataURI(script, btnId)}`}
        />
        {children}
      </>
    );
  },
  ErrorFallback: ({ isDeploy, debugEnabled, name, error }) => {
    return (
      <div style={isDeploy && !debugEnabled ? "display: none" : undefined}>
        <p>Error happened rendering {name}: {error.message}</p>
        <button {...usePartialSection()}>Retry</button>
      </div>
    );
  },
};

export default bindings;
