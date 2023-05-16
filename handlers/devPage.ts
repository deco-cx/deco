import { Page } from "$live/blocks/page.ts";
import Fresh from "$live/handlers/fresh.ts";
import { context } from "$live/live.ts";
import { adminUrlFor, isAdmin } from "$live/utils/admin.ts";
import { ConnInfo } from "std/http/server.ts";

export interface DevConfig {
  page: Page;
}

/**
 * @title Private Fresh Page
 * @description Useful for pages under development.
 */
export default function DevPage(devConfig: DevConfig) {
  const freshHandler = Fresh(devConfig);
  return (req: Request, ctx: ConnInfo) => {
    const referer = req.headers.get("origin") ?? req.headers.get("referer");
    const isOnAdmin = referer && isAdmin(referer);
    const pageParent = devConfig.page.metadata
      ?.resolveChain[devConfig.page.metadata?.resolveChain.length - 2];

    if (
      context.isDeploy
    ) {
      if (!referer || !isOnAdmin) {
        if (!pageParent) {
          return Response.error();
        }
        // redirect
        return Response.redirect(
          adminUrlFor(pageParent, context.siteId),
        );
      }
    }
    return freshHandler(req, ctx);
  };
}
