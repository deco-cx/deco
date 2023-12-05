import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Page } from "../../../blocks/page.tsx";
import Render from "../../../routes/[...catchall].tsx";
import { DecoSiteState, DecoState } from "../../../types.ts";
import { bodyFromUrl } from "../../../utils/http.ts";

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

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<unknown, DecoSiteState>
  >,
): Promise<Response> => {
  if (req.headers.get("upgrade") != "websocket") {
    const props = await getPropsFromRequest(req);
    return await render(req.url, await props, req, ctx);
  }
  const { socket, response } = Deno.upgradeWebSocket(req);
  const cache: Record<string, Promise<string>> = {};
  socket.onopen = () => {
    ctx.state.monitoring.logger.log("connected to render socket.");
  };
  socket.onmessage = async (e) => {
    try {
      const data = JSON.parse(e.data);
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
      ctx.state.monitoring.logger.error("failed to render:", err);
    }
  };
  socket.onclose = () =>
    ctx.state.monitoring.logger.log("render socket closed.");
  socket.onerror = (e) =>
    ctx.state.monitoring.logger.log("render socket error:", e);
  return response;
};

export const render = async (
  previewUrl: string,
  // deno-lint-ignore no-explicit-any
  props: any,
  req: Request,
  ctx: HandlerContext<
    unknown,
    DecoState<unknown, DecoSiteState>
  >,
) => {
  const { state: { resolve, monitoring } } = ctx;
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
      context: { ...ctx, params: params ?? ctx.params },
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
