import { context } from "$live/live.ts";
import {
  DomInspector,
  inspectHandler,
} from "https://deno.land/x/inspect_vscode@0.2.0/mod.ts";

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

export { DomInspector, inspectHandler };
