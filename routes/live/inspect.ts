import { inspectHandler } from "https://deno.land/x/inspect_vscode@0.2.1/mod.ts";

export const handler = (req: Request) => {
  return inspectHandler("/live/inspect", req);
};
