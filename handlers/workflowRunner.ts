import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import { workflowHTTPHandler } from "$live/deps.ts";
import type { Manifest } from "$live/live.gen.ts";
import { LiveConfig, LiveState } from "$live/mod.ts";
import { ConnInfo } from "std/http/server.ts";
import { Handler } from "../blocks/handler.ts";
import { isFreshCtx } from "./fresh.ts";
export interface Config {
  workflow: Workflow;
}

export default function WorkflowHandler({ workflow }: Config): Handler {
  return (req: Request, conn: ConnInfo) => {
    if (isFreshCtx<LiveConfig<unknown, LiveState, Manifest>>(conn)) {
      const handler = workflowHTTPHandler(
        workflow,
        (exec) => new WorkflowContext(conn.state, exec),
      );
      return handler(req, conn);
    }
    return new Response(null, { status: 501 });
  };
}
