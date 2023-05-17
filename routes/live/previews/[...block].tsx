import { HandlerContext, PageProps } from "$fresh/server.ts";
import { Page } from "$live/blocks/page.ts";
import LiveAnalytics from "$live/components/LiveAnalytics.tsx";
import LiveControls from "$live/components/LiveControls.tsx";
import LivePolyfills from "$live/components/LivePolyfills.tsx";
import { context } from "$live/live.ts";
import Render from "$live/routes/[...catchall].tsx";
import { LiveConfig, LiveState } from "$live/types.ts";
import { bodyFromUrl } from "$live/utils/http.ts";

const paramsFromUrl = (
  url: URL,
): Record<string, string | undefined> | undefined => {
  const pathTemplate = url.searchParams.get("pathTemplate");
  const pathname = url.searchParams.get("path");
  if (pathTemplate === null || pathname == null) {
    return undefined;
  }

  const urlPattern = new URLPattern({ pathname: pathTemplate });
  const params = urlPattern.exec({ pathname })?.pathname.groups;
  return params;
};

export default function Preview(props: PageProps<Page>) {
  const renderProps = {
    ...props,
    data: {
      page: props.data,
    },
  };
  const { data } = props;
  const pageParent =
    data.metadata?.resolveChain[data.metadata?.resolveChain.length - 2];
  return (
    <>
      <LivePolyfills />
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: pageParent || "-1",
        }}
      />
      <LiveAnalytics />

      <Render {...renderProps}></Render>
    </>
  );
}

const addLocal = (block: string): string =>
  block.startsWith("islands") && block.endsWith("tsx") ? `./${block}` : block;
export const handler = async (
  req: Request,
  ctx: HandlerContext<
    unknown,
    LiveConfig<unknown, LiveState>
  >,
) => {
  const { state: { resolve } } = ctx;
  const url = new URL(req.url);
  const props = req.method === "POST"
    ? await req.json()
    : bodyFromUrl("props", url) ?? {};

  const block = addLocal(ctx.params.block);

  const end = ctx.state?.t.start("load-data");
  const page = await resolve(
    {
      __resolveType: "preview",
      block,
      props,
    },
    false,
    { context: { ...ctx, params: paramsFromUrl(url) ?? ctx.params } },
  );
  end?.();

  return await ctx.render(
    page,
  );
};
