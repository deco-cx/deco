/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import { renderToString } from "npm:preact-render-to-string@6.4.0";
import { type ComponentChildren, options } from "preact";
import type { ContextRenderer, PageData } from "../deps.ts";
import { Head } from "./Bindings.tsx";
export { Head } from "./Bindings.tsx";

export const renderFn: ContextRenderer = <TData extends PageData = PageData>(
  { page, heads }: TData,
) => {
  const original = options.vnode;
  const htmlHead: ComponentChildren[] = [];
  options.vnode = (vnode) => {
    const vNodeType = vnode.type;
    const isFunc = typeof vNodeType === "function";
    // we support current fresh's Head
    if (
      isFunc &&
      (vNodeType === Head || (vNodeType.displayName === "HTMLHead"))
    ) {
      htmlHead.push(vnode.props.children);
    }
    return original?.(vnode);
  };
  const body = renderToString(
    <page.Component
      {...page.props}
    />,
  );
  options.vnode = original;
  return new Response(
    `<!DOCTYPE html>
                    <html lang="en">
                    <head>
                    <meta charset="utf-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">${
      renderToString(
        <>
          {([
            ...htmlHead ??
              [],
            ...heads ?? [],
          ] as ComponentChildren[]).map(
            (child) => (
              <>
                {child}
              </>
            ),
          )}
        </>,
      )
    }</head><body>${body}</body></html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html, charset=utf-8",
      },
    },
  );
};
