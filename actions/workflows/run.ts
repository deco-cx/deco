import { RunRequest, workflowRemoteRunner } from "$durable/handler.ts";
import { Command } from "$durable/runtime/core/commands.ts";
import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
export interface Props extends RunRequest {
  metadata: {
    workflow: Workflow;
  };
}

export default function runWorkflow(
  { metadata: { workflow }, ...runReq }: Props,
): Command {
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler(runReq);
}
