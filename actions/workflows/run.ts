import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import { Arg, Command, RunRequest, workflowRemoteRunner } from "$live/deps.ts";

export type Props = RunRequest<Arg, { workflow: Workflow }>;
/**
 * @description Proceed the workflow execution based on the current state of the workflow.
 */
export default function runWorkflow(
  props: Props,
): Command {
  const { metadata: { workflow } } = props;
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler(props);
}
