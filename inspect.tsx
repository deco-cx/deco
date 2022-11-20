import { context } from "$live/live.ts";
import { inspectHandler } from "inspect_vscode/handler.ts";

const inspectPath = "/_live/inspect/";

export async function withInspect(
  req: Request,
) {
  const url = new URL(req.url);
  if (
    req.method === "POST" &&
    url.pathname.startsWith(inspectPath) &&
    context.isDeploy === false
  ) {
    return await inspectHandler(inspectPath, req);
  }
}
