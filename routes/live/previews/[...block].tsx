// deno-lint-ignore-file no-explicit-any
import { HandlerContext, PageProps } from "$fresh/server.ts";
import { LiveConfig } from "$live/blocks/handler.ts";
import { Page } from "$live/blocks/page.ts";
import LiveControls from "$live/components/LiveControls.tsx";
import { context } from "$live/live.ts";
import Render from "$live/routes/[...catchall].tsx";
import { LiveState } from "$live/types.ts";

export default function Preview(props: PageProps<Page>) {
  const renderProps = {
    ...props,
    data: {
      page: props.data,
    },
  };
  return (
    <>
      <LiveControls
        site={{ id: context.siteId, name: context.site }}
        page={{
          id: props.data?.metadata?.id!,
        }}
      />
      <Render {...renderProps}></Render>
    </>
  );
}

const isNumber = new RegExp("/^-?\d+\.?\d*$/");

const buildObj = (
  partial: Record<string, any>,
  [keys, value]: [string[], string],
) => {
  const [first, ...rest] = keys;
  partial[first] ??= {};
  if (rest.length === 0) {
    partial[first] = isNumber.test(value) ? +value : value;
    return;
  }
  buildObj(partial[first], [rest, value]);
};
const propsFromUrl = (url: URL): Record<string, any> => {
  const props = url.searchParams.get("props");
  if (!props) {
    const start = {};
    for (const [key, value] of url.searchParams.entries()) {
      buildObj(start, [key.split("."), value]);
    }
    return start;
  }
  // frombase64
  return JSON.parse(atob(props));
};

const paramsFromUrl = (url: URL): Record<string, string> | undefined => {
  const pathTemplate = url.searchParams.get("pathTemplate");
  const pathname = url.searchParams.get("path");
  if (pathTemplate === null || pathname == null) {
    return undefined;
  }

  const urlPattern = new URLPattern({ pathname });
  const params = urlPattern.exec({ pathname })?.pathname.groups;
  return params;
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
  const props = req.method === "POST"
    ? await req.json()
    : propsFromUrl(url) ?? {};

  const block = ctx.params.block;

  ctx.params = paramsFromUrl(url) ?? ctx.params;
  return await ctx.render(
    await resolve({
      __resolveType: "preview",
      block,
      props,
    }),
  );
};
