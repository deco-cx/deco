/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import { Head, Partial } from "$fresh/runtime.ts";
import type { Framework } from "@deco/deco";
import { usePartialSection } from "@deco/deco/hooks";
import DispatchAsyncRender from "./islands/DispatchAsyncRender.tsx";

const bindings: Framework = {
  name: "fresh",
  Head,
  Wrapper: ({ id, partialMode, children }) => (
    <Partial name={id} mode={partialMode}>{children}</Partial>
  ),
  LoadingFallback: ({ id, children, props }) => {
    const btnId = `${id}-partial-onload`;
    const { "f-partial": href, ...rest } = usePartialSection({ props });

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
        <DispatchAsyncRender id={btnId} />
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
