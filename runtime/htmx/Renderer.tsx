import { type ComponentChildren, type ComponentType, options } from "preact";
import renderToString from "preact-render-to-string";
import type { PageParams } from "../app.ts";
import type { ContextRenderer } from "../deps.ts";
import bindings from "./Bindings.tsx";

export const Head = bindings.Head!;

export const factory = (
  Component: ComponentType<Pick<PageParams, "data">>,
): ContextRenderer => {
  return function <TData = unknown>(data: TData) {
    const original = options.vnode;
    const htmlHead: ComponentChildren[] = [];
    options.vnode = (vnode) => {
      if (vnode.type === Head) {
        htmlHead.push(vnode.props.children);
      }
      return original?.(vnode);
    };
    const body = renderToString(
      <Component
        data={data}
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
            {((htmlHead ??
              []) as ComponentChildren[]).map(
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
};
