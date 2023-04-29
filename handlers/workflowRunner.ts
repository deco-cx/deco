import { workflowHTTPHandler } from "$durable/mod.ts";
import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
export interface Config {
  workflow: Workflow;
}

export default function WorkflowHandler({ workflow }: Config) {
  const handler = workflowHTTPHandler(workflow, WorkflowContext);
  return handler;
}
