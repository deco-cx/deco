import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveControls from "$live/components/LiveControls.tsx";
import LivePolyfills from "$live/components/LivePolyfills.tsx";
import { context } from "$live/live.ts";
import Render from "$live/routes/[...catchall].tsx";
import { LiveConfig, LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";

const CONTENT_TYPE = "content-type";
const APPLICATION_FORM_URLENCODED = "application/x-www-form-urlencoded";

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
      <LiveAnalytics />

      <Render {...renderProps}></Render>
    </>
  );
}

const addLocal = (block: string): string =>
  block.startsWith("islands") && block.endsWith("tsx") ? `./${block}` : block;

const getPropsFromRequest = async (req: Request) => {
  const url = new URL(req.url);
  if (req.method === "POST") {
    const data = (req.headers.get(CONTENT_TYPE) === APPLICATION_FORM_URLENCODED
      ? JSON.parse(
        (await req.clone().formData()).get("props")?.toString() || "{}",
      )
      : (await req.json())) ?? {};

    return data;
  }

  return bodyFromUrl("props", url) ?? {};
};

export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<unknown, LiveState>
  >,
) => {
  const { state: { resolve } } = ctx;
  const url = new URL(req.url);
  const props = await getPropsFromRequest(req);
  const block = addLocal(ctx.params.block);

  const end = ctx.state?.t.start("load-data");
  const [params, pathname] = paramsFromUrl(url);
  const newUrl = new URL(req.url);
  if (pathname) {
    newUrl.pathname = pathname;
  }
  const newReq = new Request(newUrl, req);
  const page = await resolve(
    {
      __resolveType: "preview",
      block,
      props,
    },
    false,
    {
      context: { ...ctx, params: params ?? ctx.params },
      request: newReq,
    },
  );
  end?.();

  return await ctx.render(page);
};
