import { Handlers, MiddlewareHandlerContext } from "$fresh/server.ts";
import { DecoManifest, LiveOptions, Page, WithLiveState } from "$live/types.ts";
import { formatLog } from "$live/utils/log.ts";
import { createServerTimings } from "$live/utils/timings.ts";
import { verifyDomain } from "$live/utils/domains.ts";
import { withPages } from "$live/pages.ts";
import { withWorkbench } from "$live/workbench.ts";
import { withInspect } from "$live/inspect.ts";

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

export const withLive = (
  liveOptions?: LiveOptions,
) => {
  if (!liveOptions) {
    throw new Error("liveOptions is required.");
  }
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

  return async (
    req: Request,
    ctx: MiddlewareHandlerContext<WithLiveState>,
  ) => {
    if (!context.manifest) {
      context.manifest = globalThis.manifest;
    }

    const begin = performance.now();
    const url = new URL(req.url);

    const { start, end, printTimings } = createServerTimings();
    ctx.state.t = { start, end, printTimings };

    const domainRes = verifyDomain(url.hostname);
    if (domainRes) {
      return domainRes;
    }

    const inspectRes = await withInspect(req);
    if (inspectRes) {
      return inspectRes;
    }

    const workbenchRes = withWorkbench(url.pathname);
    if (workbenchRes) {
      return workbenchRes;
    }

    const res = await withPages(req, ctx);

    res.headers.set("Server-Timing", printTimings());

    console.info(
      formatLog({ status: res.status, url, pageId: ctx.state.page?.id, begin }),
    );

    return res;
  };
};

export const live: () => Handlers<Page, WithLiveState> = () => ({
  GET(_, ctx) {
    if (context.isDeploy && !ctx.state.page) {
      ctx.renderNotFound();
    }
    // TODO: If !isDeploy, render "create new page" component
    return ctx.render(ctx.state.page);
  },
});
