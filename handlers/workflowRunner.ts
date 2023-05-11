import { workflowHTTPHandler } from "$live/deps.ts";
import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import { Handler } from "../blocks/handler.ts";
export interface Config {
  workflow: Workflow;
}

export default function WorkflowHandler({ workflow }: Config): Handler {
  // FIXME missing verify request signature here.
  const handler = workflowHTTPHandler(workflow, WorkflowContext);
  return handler;
}
