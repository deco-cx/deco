import { PageOptions } from "./pages.ts";
import {
  HandlerContext,
  Handlers,
  MiddlewareHandlerContext,
} from "$fresh/server.ts";
import { inspectHandler } from "https://deno.land/x/inspect_vscode@0.2.0/mod.ts";
import {
  DecoManifest,
  LiveOptions,
  LivePageData,
  LiveState,
} from "$live/types.ts";
import { generateEditorData, isPageOptions, loadPage } from "$live/pages.ts";
import { formatLog } from "$live/utils/log.ts";
import { createServerTimings } from "$live/utils/timings.ts";
import { verifyDomain } from "$live/utils/domains.ts";
import { workbenchHandler } from "$live/utils/workbench.ts";
import { loadFlags } from "$live/flags.ts";

// The global live context
export type LiveContext = {
  manifest?: DecoManifest;
  deploymentId: string | undefined;
  isDeploy: boolean;
  domains: string[];
  site: string;
  siteId: number;
  loginUrl?: string;
};

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
export const context: LiveContext = {
  deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
  isDeploy: Boolean(Deno.env.get("DENO_DEPLOYMENT_ID")),
  domains: ["localhost"],
  site: "",
  siteId: 0,
};
declare global {
  var manifest: DecoManifest;
}

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
  context.domains.push(
    `${liveOptions.site}.deco.page`,
    `${liveOptions.site}.deco.site`,
    `deco-pages-${liveOptions.site}.deno.dev`,
    `deco-sites-${liveOptions.site}.deno.dev`,
  );
  liveOptions.domains?.forEach((domain) => context.domains.push(domain));
  // Support deploy preview domains
  if (context.deploymentId !== undefined) {
    context.domains.push(
      `deco-pages-${context.site}-${context.deploymentId}.deno.dev`,
    );
    context.domains.push(
      `deco-sites-${context.site}-${context.deploymentId}.deno.dev`,
    );
  }

  console.log(
    `Starting live middleware: siteId=${context.siteId} site=${context.site}`,
  );

  return async (req: Request, ctx: MiddlewareHandlerContext<LiveState>) => {
    if (!context.manifest) {
      context.manifest = globalThis.manifest;
    }
    ctx.state.site = {
      id: context.siteId,
      name: context.site,
    };

    const begin = performance.now();
    const url = new URL(req.url);

    const { start, end, printTimings } = createServerTimings();
    ctx.state.t = { start, end };

    const domainRes = verifyDomain(url.hostname);
    if (domainRes) {
      return domainRes;
    }

    // TODO: Find a better way to embedded these routes on project routes.
    // Follow up here: https://github.com/denoland/fresh/issues/516
    if (
      req.method === "POST" &&
      url.pathname.startsWith(inspectPath) &&
      context.isDeploy === false
    ) {
      return await inspectHandler(inspectPath, req);
    }

    if (url.pathname === workbenchPath) {
      return workbenchHandler();
    }

    // Allow introspection of page by editor
    if (url.searchParams.has("editorData")) {
      const pageId = url.searchParams.get("pageId");
      const editorData = await generateEditorData(req, pageId);

      return Response.json(editorData, {
        headers: {
          "Access-Control-Allow-Origin": "*",
        },
      });
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

export const getLivePageData = async <Data>(
  req: Request,
  ctx: HandlerContext<Data, LiveState>,
) => {
  const flags = await loadFlags(req, ctx);

  const pageOptions = flags.reduce(
    (acc, curr) => {
      if (isPageOptions(curr.value)) {
        acc.selectedPageIds = [
          ...acc.selectedPageIds,
          ...curr.value.selectedPageIds,
        ];
      }

      return acc;
    },
    { selectedPageIds: [] } as PageOptions,
  );

  return {
    flags: ctx.state.flags,
    page: await loadPage(req, ctx, pageOptions),
  };
};

export const live: () => Handlers<LivePageData, LiveState> = () => ({
  GET: async (req, ctx) => {
    const { page, flags } = await getLivePageData(req, ctx);

    if (!page) {
      return ctx.renderNotFound();
    }

    return ctx.render({ page, flags });
  },
});
