import { context } from "$live/live.ts";
import { inspectHandler } from "https://cdn.jsdelivr.net/gh/deco-cx/inspect-vscode@0.2.1/mod.ts";

export const handler = (req: Request) => {
  return inspectHandler(`/live/inspect/${context.namespace}`, req);
};
