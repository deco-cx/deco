import type { ComponentChildren } from "preact";
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from "preact/jsx-runtime";
import type { Framework } from "../../components/section.ts";
import { useSection } from "../../hooks/useSection.ts";

export const Head = (_: { children: ComponentChildren }): null => {
  return null;
};
const bindings: Framework = {
  name: "htmx",
  Head,
  Wrapper: ({ children }) =>
    /*#__PURE__*/ _jsx(_Fragment, {
      children: children,
    }),
  ErrorFallback: function ({ isDeploy, debugEnabled, name, error }) {
    return /*#__PURE__*/ _jsxs("div", {
      style: isDeploy && !debugEnabled ? "display: none" : undefined,
      children: [
        /*#__PURE__*/ _jsxs("p", {
          children: [
            "Error happened rendering ",
            name,
            ": ",
            error.message,
          ],
        }),
        /*#__PURE__*/ _jsx("button", {
          "hx-get": useSection(),
          "hx-target": "closest section",
          "hx-swap": "outerHTML transition:true",
          children: "Retry",
        }),
      ],
    });
  },
  LoadingFallback: function ({ children, props }) {
    return /*#__PURE__*/ _jsx("div", {
      "hx-get": useSection({
        props,
      }),
      "hx-trigger": "load once delay:6s, intersect once threshold:0.0",
      "hx-target": "closest section",
      "hx-swap": "outerHTML transition:true",
      children: children,
    });
  },
};

export default bindings;
