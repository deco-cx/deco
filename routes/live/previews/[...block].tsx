// deno-lint-ignore-file no-explicit-any
import { HandlerContext, PageProps } from "$fresh/server.ts";
import { LiveConfig } from "$live/blocks/handler.ts";
import { Page } from "$live/blocks/page.ts";
import { LiveState } from "$live/types.ts";

export default function Render({
  data: { Component, props, key },
}: PageProps<Page>) {
  return <Component data-manifest-key={key} {...props}></Component>;
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
  return await ctx.render(
    await resolve({
      __resolveType: "preview",
      block: `${ctx.params.block}`,
      props,
    }),
  );
};
