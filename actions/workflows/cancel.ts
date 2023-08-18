import { cancel } from "../../commons/workflows/initialize.ts"; // side-effect initialize

export interface Props {
  executionId: string;
  reason?: string;
}

/**
 * @description Cancels the workflow execution, you can, optionally, add a reason of the cancellation.
 */
export default async function cancelWorkflow(
  { reason, executionId }: Props,
): Promise<void> {
  await cancel(executionId, reason);
}
