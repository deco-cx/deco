import { ConnInfo } from "std/http/server.ts";
import { Handler } from "../blocks/handler.ts";
import { Workflow, WorkflowContext } from "../blocks/workflow.ts";
import { workflowHTTPHandler } from "../deps.ts";
import { AppManifest, DecoSiteState, DecoState } from "../mod.ts";
import { isFreshCtx } from "./fresh.ts";
export interface Config {
  workflow: Workflow;
}

export default function WorkflowHandler({ workflow }: Config): Handler {
  return (req: Request, conn: ConnInfo) => {
    if (isFreshCtx<DecoState<unknown, DecoSiteState, AppManifest>>(conn)) {
      const handler = workflowHTTPHandler(
        workflow,
        (exec) => new WorkflowContext(conn.state, exec),
      );
      return handler(req, conn);
    }
    return new Response(null, { status: 501 });
  };
}
