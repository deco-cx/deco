import { type ComponentChildren, options } from "preact";
import renderToString from "preact-render-to-string";
import type { ContextRenderer, PageData } from "../deps.ts";
import { Head } from "./Bindings.tsx";
export { Head } from "./Bindings.tsx";

export const renderFn: ContextRenderer = <TData extends PageData = PageData>(
  { page }: TData,
) => {
  const original = options.vnode;
  const htmlHead: ComponentChildren[] = [];
  options.vnode = (vnode) => {
    if (vnode.type === Head) {
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
