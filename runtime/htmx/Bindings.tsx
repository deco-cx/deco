import type { Framework } from "../../components/section.tsx";
import { useSection } from "../../hooks/useSection.ts";

const bindings: Framework = {
  Wrapper: ({ children }) => <>{children}</>,
  ErrorFallback: function ({ isDeploy, debugEnabled, name, error }) {
    return (
      <div style={isDeploy && !debugEnabled ? "display: none" : undefined}>
        <p>Error happened rendering {name}: {error.message}</p>
        <button
          hx-get={useSection()}
          hx-target="closest section"
          hx-swap="outerHTML"
        >
          Retry
        </button>
      </div>
    );
  },
  LoadingFallback: function ({ children }) {
    return (
      <div
        hx-get={useSection()}
        hx-trigger="intersect once"
        hx-target="closest section"
        hx-swap="outerHTML"
      >
        {children}
      </div>
    );
  },
};

export default bindings;
