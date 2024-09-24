import type { JSX } from "preact";
import {
  Fragment as _Fragment,
  jsx as _jsx,
  jsxs as _jsxs,
} from "preact/jsx-runtime";
import { useFramework } from "../runtime/handler.ts";

export interface Props {
  body: string;
}

const snippet = (json: string) => {
  const node = ([
    ["script", { src: "https://code.jquery.com/jquery-3.6.4.min.js" }],
    ["script", {
      src:
        "https://cdnjs.cloudflare.com/ajax/libs/jquery-jsonview/1.2.3/jquery.jsonview.min.js",
    }],
    ["link", {
      href:
        "https://cdnjs.cloudflare.com/ajax/libs/jquery-jsonview/1.2.3/jquery.jsonview.min.css",
      type: "text/css",
      rel: "stylesheet",
    }],
  ] as const).reduce((node: HTMLElement | null, [element, attributes]) => {
    const n = document.createElement(element);
    Object.entries(attributes).forEach(([key, value]) =>
      n.setAttribute(key, value)
    );

    if (node) {
      node.addEventListener("load", () => document.head.appendChild(n));
    } else {
      // first element of reduce
      document.head.appendChild(n);
    }

    return n;
  }, null);

  node?.addEventListener(
    "load",
    // deno-lint-ignore no-explicit-any
    () => (globalThis.window as any).jQuery("#json-renderer").JSONView(json),
  );
};

/**
 * Renders a JSON object in a formatted and interactive way.
 *
 * @param {Props} p - Props for the JSON viewer component.
 * @returns {JSX.Element} The rendered JSON viewer component.
 */
export default function JsonViewer(p: Props): JSX.Element {
  const { Head } = useFramework();
  return /*#__PURE__*/ _jsxs(_Fragment, {
    children: [
      // @ts-expect-error: JSX does not have a script element
      /*#__PURE__*/ _jsx(Head, {
        children: /*#__PURE__*/ _jsx("script", {
          type: "module",
          dangerouslySetInnerHTML: {
            __html: `(${snippet})(${p.body});`,
          },
        }),
      }),
      /*#__PURE__*/ _jsx("pre", {
        id: "json-renderer",
        children: p.body,
      }),
    ],
  });
}
