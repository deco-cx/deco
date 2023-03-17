/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { Handlers, MiddlewareHandlerContext } from "$fresh/server.ts";
import { cookies, loadFlags } from "$live/flags.ts";
import {
  generateEditorData,
  isPageOptions,
  loadPage,
  PageOptions,
} from "$live/pages.ts";
import {
  DecoManifest,
  LiveOptions,
  LivePageData,
  LiveState,
} from "$live/types.ts";
import { adminDomain, adminUrlFor, isAdmin } from "$live/utils/admin.ts";
import { formatLog } from "$live/utils/log.ts";
import { createServerTimings } from "$live/utils/timings.ts";
import { workbenchHandler } from "$live/utils/workbench.ts";
import { inspectVSCode } from "./deps.ts";

// The global live context
export type LiveContext = {
  manifest?: DecoManifest;
  deploymentId: string | undefined;
  isDeploy: boolean;
  site: string;
  siteId: number;
  loginUrl?: string;
};

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
export const context: LiveContext = {
  deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
  isDeploy: Boolean(Deno.env.get("DENO_DEPLOYMENT_ID")),
  site: "",
  siteId: 0,
};

export const withLive = (liveOptions: LiveOptions) => {
  if (!liveOptions.site) {
    throw new Error(
      "liveOptions.site is required. It should be the name of the site you created in deco.cx.",
    );
  }
  if (!liveOptions.siteId) {
    throw new Error(
      "liveOptions.siteId is required. You can get it from the site URL: https://deco.cx/live/{siteId}",
    );
  }

  // Enable InspectVSCode library
  const inspectPath = liveOptions.inspectPath || "/_live/inspect";
  // Enable Workbench
  const workbenchPath = liveOptions.workbenchPath || "/_live/workbench";

  context.site = liveOptions.site;
  context.siteId = liveOptions.siteId;
  context.loginUrl = liveOptions.loginUrl;

  console.log(
    `Starting live middleware: siteId=${context.siteId} site=${context.site}`,
  );

  return async (req: Request, ctx: MiddlewareHandlerContext<LiveState>) => {
    ctx.state.site = {
      id: context.siteId,
      name: context.site,
    };

    const begin = performance.now();
    const url = new URL(req.url);

    const { start, end, printTimings } = createServerTimings();
    ctx.state.t = { start, end };

    // TODO: Find a better way to embedded these routes on project routes.
    // Follow up here: https://github.com/denoland/fresh/issues/516
    if (
      req.method === "POST" &&
      url.pathname.startsWith(inspectPath) &&
      context.isDeploy === false
    ) {
      return await inspectVSCode.inspectHandler(inspectPath, req);
    }

    if (url.pathname === workbenchPath) {
      return workbenchHandler();
    }

    // Let rendering occur — handlers are responsible for calling ctx.state.loadPage
    const initialResponse = await ctx.next();

    const newHeaders = new Headers(initialResponse.headers);
    newHeaders.set("Server-Timing", printTimings());

    const newResponse = new Response(initialResponse.body, {
      status: initialResponse.status,
      headers: newHeaders,
    });

    // TODO: print these on debug mode when there's debug mode.
    if (!url.pathname.startsWith("/_frsh")) {
      console.info(
        formatLog({
          status: initialResponse.status,
          url,
          pageId: ctx.state.page?.id,
          begin,
        }),
      );
    }

    return newResponse;
  };
};

export const live: () => Handlers<LivePageData, LiveState> = () => ({
  GET: async (req, ctx) => {
    const url = new URL(req.url);

    const { activeFlags, flagsToCookie } = await loadFlags(req, ctx);

    ctx.state.flags = activeFlags;

    const pageOptions = Object.values(ctx.state.flags).reduce(
      (acc: PageOptions, curr) => {
        if (isPageOptions(curr)) {
          acc.selectedPageIds = [
            ...acc.selectedPageIds,
            ...curr.selectedPageIds,
          ];
        }

        return acc;
      },
      { selectedPageIds: [] } as PageOptions,
    );

    const origin = req.headers.get("origin");
    const getResponse = async () => {
      // Allow introspection of page by editor
      if (url.searchParams.has("editorData")) {
        const editorData = await generateEditorData(req, ctx, pageOptions);

        return Response.json(editorData, {
          headers: {
            "Access-Control-Allow-Origin": origin || "*",
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, *",
          },
        });
      }

      const loaded = await loadPage(req, ctx, pageOptions);
      const referer = origin ?? req.headers.get("referer");
      const isOnAdmin = referer && isAdmin(referer);

      if (
        context.isDeploy &&
        loaded?.page.public !== undefined &&
        !loaded?.page.public
      ) {
        if (!referer || !isOnAdmin) {
          // redirect
          return Response.redirect(
            adminUrlFor(loaded.page.id, context.siteId),
          );
        }
      }

      if (!loaded) {
        return ctx.renderNotFound();
      }

      const response = await ctx.render({
        page: loaded.page,
        flags: ctx.state.flags,
      });

      for (const [key, value] of loaded.headers) {
        value && response.headers.set(key, value);
      }
      const localhost =
        "127.0.0.1:* localhost:* http://localhost:* http://127.0.0.1:*";
      response.headers.set(
        "Content-Security-Policy",
        `frame-ancestors ${localhost} ${adminDomain} ${
          referer && isOnAdmin ? "https://" + new URL(referer).host : ""
        }`,
      );

      return new Response(response.body, {
        status: loaded.status ?? response.status,
        headers: response.headers,
      });
    };

    const response = await getResponse();

    if (flagsToCookie.length > 0) {
      cookies.setFlags(response.headers, flagsToCookie);
      response.headers.append("vary", "cookie");
    }

    return response;
  },
});
