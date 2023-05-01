import { Command, RunRequest, workflowRemoteRunner } from "$live/deps.ts";
import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
export interface Props extends RunRequest {
  metadata: {
    workflow: Workflow;
  };
}

/**
 * @description Proceed the workflow execution based on the current state of the workflow.
 */
export default function runWorkflow(
  { metadata: { workflow }, ...runReq }: Props,
): Command {
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler(runReq);
}
