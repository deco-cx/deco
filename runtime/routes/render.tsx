/** @jsxRuntime automatic */
/** @jsxImportSource preact */

import { FieldResolver } from "../../engine/core/resolver.ts";
import { badRequest } from "../../engine/errors.ts";
import { createHandler, DEBUG_QS } from "../middleware.ts";
import type { PageParams } from "../mod.ts";
import Render, { type PageData } from "./entrypoint.tsx";

interface Options {
  resolveChain?: FieldResolver[];
  props: Record<string, unknown>;
  href: string;
  pathTemplate: string;
  renderSalt?: string;
  partialMode?: "replace" | "prepend" | "append";
  framework: "fresh" | "htmx";
  searchParams: URLSearchParams;
}

export interface Props {
  url: string;
}

const fromRequest = (req: Request): Options => {
  const params = new URL(req.url).searchParams;

  const resolveChain = params.get("resolveChain");
  const props = params.get("props");
  const href = params.get("href");
  const pathTemplate = params.get("pathTemplate");
  const renderSalt = params.get("renderSalt");
  const framework = params.get("framework") ?? "fresh";
  const partialMode = params.get("partialMode") as
    | "replace"
    | "prepend"
    | "append"
    | undefined;

  if (!props) {
    throw badRequest({ code: "400", message: "Missing props" });
  }

  const parsedProps = JSON.parse(props);

  if (!resolveChain && !parsedProps.__resolveType) {
    throw badRequest({
      code: "400",
      message: "Missing resolve chain or __resolveType on props root",
    });
  }
  if (!href) {
    throw badRequest({ code: "400", message: "Missing href" });
  }
  if (!pathTemplate) {
    throw badRequest({ code: "400", message: "Missing pathTemplate" });
  }

  return {
    props: parsedProps,
    href,
    framework: framework as "fresh" | "htmx",
    pathTemplate,
    renderSalt: renderSalt ?? undefined,
    partialMode: partialMode ?? undefined,
    resolveChain: resolveChain
      ? FieldResolver.unwind(JSON.parse(resolveChain))
      : undefined,
    searchParams: params,
  };
};

const DECO_RENDER_CACHE_CONTROL = Deno.env.get("DECO_RENDER_CACHE_CONTROL") ||
  "public, max-age=60, s-maxage=60, stale-while-revalidate=3600, stale-if-error=86400";

export const handler = createHandler(async (
  ctx,
) => {
  const { req: { raw: req }, var: state, render } = ctx;
  const opts = fromRequest(req);
  const isDebugRequest = opts.searchParams.has(DEBUG_QS);

  const { page, shouldCache } = await state.deco.render(req, opts, state);

  if (isDebugRequest) {
    return Response.json({ debugData: state.vary.debug.build() });
  }

  const response = await render({
    page: {
      Component: Render,
      props: {
        params: ctx.req.param(),
        url: ctx.var.url,
        data: { page },
      } satisfies PageParams<PageData>,
    },
  });

  // this is a hack to make sure we cache only sections that does not vary based on the loader content.
  // so we can calculate cacheBust per page but decide to cache sections individually based on vary.
  // ideally cachebust should be calculated per section as well so that you can reuse section across pages and produce same cacheBusts.
  const shouldCacheFromVary = ctx?.var?.vary?.shouldCache === true;
  if (shouldCache && shouldCacheFromVary) {
    // Stale cache on CDN, but make the browser fetch every single time.
    // We can test if caching on the browser helps too.
    response.headers.set(
      "cache-control",
      DECO_RENDER_CACHE_CONTROL,
    );
  } else {
    response.headers.set(
      "cache-control",
      "no-store, no-cache, must-revalidate",
    );
  }

  return response;
});
