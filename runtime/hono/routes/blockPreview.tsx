import type { PageProps } from "$fresh/server.ts";
import type { Page } from "../../../blocks/page.tsx";
import { bodyFromUrl } from "../../../utils/http.ts";
import { createHandler, type DecoMiddlewareContext } from "../middleware.ts";
import Render from "./entrypoint.tsx";

const paramsFromUrl = (
  url: URL,
): [Record<string, string | undefined> | undefined, string | null] => {
  const pathTemplate = url.searchParams.get("pathTemplate");
  const pathname = url.searchParams.get("path");
  if (pathTemplate === null || pathname == null) {
    return [undefined, null];
  }

  const urlPattern = new URLPattern({ pathname: pathTemplate });
  const params = urlPattern.exec({ pathname })?.pathname.groups;
  return [params, pathname];
};

const decoder = new TextDecoder();
export default function Preview(props: PageProps<Page>) {
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

const addLocal = (block: string): string =>
  block.startsWith("islands") && block.endsWith("tsx") ? `./${block}` : block;

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
        response.text().then(function (html) {
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
  const { resolve, monitoring } = ctx.var;
  const url = new URL(previewUrl);
  const block = addLocal(url.pathname.replace(/^\/live\/previews\//, ""));

  let timing = monitoring?.timings?.start("load-data");
  const [params, pathname] = paramsFromUrl(url);
  const newUrl = new URL(req.url);
  if (pathname) {
    newUrl.pathname = pathname;
  }
  const newReq = new Request(newUrl, {
    headers: new Headers(req.headers),
    method: "GET",
  });
  const page = await resolve(
    {
      __resolveType: "preview",
      block,
      props,
    },
    { forceFresh: false },
    {
      context: {
        ...ctx,
        params: params ?? new Proxy({}, {
          get: (_, prop) => ctx.req.param(prop as string),
        }),
      },
      request: newReq,
    },
  );
  timing?.end();

  timing = monitoring?.timings?.start("render-to-string");
  try {
    return await ctx.render(page);
  } finally {
    timing?.end();
  }
};
