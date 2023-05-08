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
    const pageId = devConfig.page.metadata?.id;

    if (
      context.isDeploy
    ) {
      if (!referer || !isOnAdmin) {
        if (!pageId) {
          return Response.error();
        }
        // redirect
        return Response.redirect(
          adminUrlFor(+pageId, context.siteId),
        );
      }
    }
    return freshHandler(req, ctx);
  };
}
