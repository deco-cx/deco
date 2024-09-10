/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import type { ComponentChildren } from "preact";
import type { Framework } from "../../components/section.tsx";
import { useSection } from "../../hooks/useSection.ts";

export const Head = (_: { children: ComponentChildren }): null => {
  return null;
};
const bindings: Framework = {
  name: "htmx",
  Head,
  Wrapper: ({ children }) => <>{children}</>,
  ErrorFallback: function ({ isDeploy, debugEnabled, name, error }) {
    return (
      <div style={isDeploy && !debugEnabled ? "display: none" : undefined}>
        <p>Error happened rendering {name}: {error.message}</p>
        <button
          hx-get={useSection()}
          hx-target="closest section"
          hx-swap="outerHTML transition:true"
        >
          Retry
        </button>
      </div>
    );
  },
  LoadingFallback: function ({ children, props }) {
    return (
      <div
        hx-get={useSection({ props })}
        hx-trigger="load once delay:6s, intersect once threshold:0.0"
        hx-target="closest section"
        hx-swap="outerHTML transition:true"
      >
        {children}
      </div>
    );
  },
};

export default bindings;
