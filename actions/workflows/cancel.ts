import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";

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
  const [_, serviceUrl] = workflowServiceInfo();
  const resp = await fetch(
    `${serviceUrl}/executions/${executionId}`,
    {
      method: "DELETE",
      body: JSON.stringify({ reason }),
    },
  );
  if (!resp.ok) {
    throw new Error(`${resp.status}, ${JSON.stringify({ reason })}`);
  }
}
