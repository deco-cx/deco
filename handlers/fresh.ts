import { HandlerContext } from "$fresh/server.ts";
import { ConnInfo } from "std/http/server.ts";
import { Page } from "../blocks/page.ts";
import {
  asResolved,
  BaseContext,
  isDeferred,
} from "../engine/core/resolver.ts";
import { DecoState, FnContext } from "../types.ts";
import { allowCorsFor } from "../utils/http.ts";

/**
 * @title Fresh Config
 */
export interface FreshConfig {
  page: Page;
}

export const isFreshCtx = <TState>(
  ctx: ConnInfo | HandlerContext<unknown, TState>,
): ctx is HandlerContext<unknown, TState> => {
  return typeof (ctx as HandlerContext).render === "function";
};

/**
 * @title Fresh Page
 * @description Renders a fresh page.
 */
export default function Fresh(freshConfig: FreshConfig, fnContext: FnContext) {
  return async (req: Request, ctx: ConnInfo) => {
    if (req.method === "HEAD") {
      return new Response(null, { status: 200 });
    }
    const endResolvePage = fnContext?.monitoring?.t?.start?.("load-data");
    const page =
      isDeferred<Page, BaseContext & { context: ConnInfo }>(freshConfig.page)
        ? await freshConfig.page({ context: ctx })
        : freshConfig.page;
    endResolvePage?.();
    const url = new URL(req.url);
    if (url.searchParams.get("asJson") !== null) {
      return Response.json(page, { headers: allowCorsFor(req) });
    }
    if (isFreshCtx<DecoState>(ctx)) {
      const end = fnContext?.monitoring?.t?.start?.("render-to-string");
      const response = await ctx.render({
        page,
        routerInfo: {
          flags: ctx.state.flags,
          pagePath: ctx.state.pathTemplate,
        },
      });
      end?.();
      return response;
    }
    return Response.json({ message: "Fresh is not being used" }, {
      status: 500,
    });
  };
}

export const onBeforeResolveProps = (
  props: FreshConfig,
) => {
  if (props?.page) {
    return { ...props, page: asResolved(props.page, true) };
  }
  return props;
};
