import type { Page } from "../../blocks/page.tsx";
import type { State } from "../app.ts";

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

const addLocal = (block: string): string =>
  block.startsWith("islands") && block.endsWith("tsx") ? `./${block}` : block;

export const preview = async (
  req: Request,
  ctx: State,
  previewUrl: string,
  props: unknown,
) => {
  const { resolve } = ctx;
  const url = new URL(previewUrl);
  const block = addLocal(url.pathname.replace(/^\/live\/previews\//, ""));

  const [params, pathname] = paramsFromUrl(url);
  const newUrl = new URL(req.url);
  if (pathname) {
    newUrl.pathname = pathname;
  }
  const newReq = new Request(newUrl, {
    headers: new Headers(req.headers),
    method: "GET",
  });
  const page = await resolve<Page>(
    {
      __resolveType: "preview",
      block,
      props,
    },
    { forceFresh: false },
    {
      context: {
        ...ctx,
        params,
      },
      request: newReq,
    },
  );

  return page;
};
