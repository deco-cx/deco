/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import type { Page } from "../../blocks/page.ts";
import { bodyFromUrl } from "../../utils/http.ts";
import { createHandler, type DecoMiddlewareContext } from "../middleware.ts";
import type { PageParams } from "../mod.ts";
import Render from "./entrypoint.tsx";

const decoder = new TextDecoder();
export default function Preview(
  props: PageParams<Page>,
) {
  const renderProps = {
    ...props,
    data: {
      page: props.data,
    },
  };

  return (
    <>
      <Render {...renderProps}></Render>
    </>
  );
}

const getPropsFromRequest = async (req: Request) => {
  const url = new URL(req.url);
  const data = req.method === "POST"
    ? await req.clone().json()
    : bodyFromUrl("props", url);

  return data ?? {};
};

export const handler = createHandler(async (
  ctx,
): Promise<Response> => {
  const { req: { raw: req }, var: state } = ctx;
  if (req.headers.get("upgrade") != "websocket") {
    const props = await getPropsFromRequest(req);
    return await render(req.url, await props, req, ctx);
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  const cache: Record<string, Promise<string>> = {};
  socket.onopen = () => {
    state.monitoring.logger.log("connected to render socket.");
  };
  socket.onmessage = async (e) => {
    try {
      let eventData = e.data;
      const target = e?.target;
      if (
        target && "binaryType" in target &&
        target.binaryType === "blob" && typeof eventData === "object" &&
        "text" in eventData
      ) {
        eventData = await eventData.text();
      }
      if (eventData instanceof ArrayBuffer) {
        eventData = decoder.decode(eventData);
      }
      const data = JSON.parse(eventData);
      const key = data.key;
      const props = JSON.parse(data.props);
      cache[key] ??= render(data.url, props, req, ctx).then((response) =>
        response.text().then(function (html: string) {
          const response = JSON.stringify({
            html,
            key,
          });
          return response;
        })
      );
      socket.send(await cache[key]);
    } catch (err) {
      state.monitoring.logger.error("failed to render:", err);
    }
  };
  socket.onclose = () => state.monitoring.logger.log("render socket closed.");
  socket.onerror = (e) =>
    state.monitoring.logger.log("render socket error:", e);
  return response;
});

export const render = async (
  previewUrl: string,
  // deno-lint-ignore no-explicit-any
  props: any,
  req: Request,
  ctx: DecoMiddlewareContext,
) => {
  let timing = ctx.var.monitoring?.timings?.start("load-data");
  const page = await ctx.var.deco.preview(req, previewUrl, props, ctx.var);
  timing?.end();
  timing = ctx.var.monitoring?.timings?.start("render-to-string");
  try {
    return await ctx.render({
      page: {
        Component: Preview,
        props: { url: ctx.var.url, params: ctx.req.param(), data: page },
      },
    });
  } finally {
    timing?.end();
  }
};
