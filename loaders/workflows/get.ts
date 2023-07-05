import {
  signedFetch,
  workflowServiceInfo,
} from "$live/commons/workflows/serviceInfo.ts";
import {
  toExecution,
  WorkflowExecution,
} from "$live/commons/workflows/types.ts";
export interface Props {
  id: string;
}

/**
 * @description Read the workflow execution information.
 */
export default async function getExecution(
  { id }: Props,
): Promise<WorkflowExecution> {
  const [_, svcUrl] = workflowServiceInfo();

  const resp = await signedFetch(`${svcUrl}/executions/${id}`);
  if (resp.ok) {
    return toExecution(await resp.json());
  }
  throw new Error(`${resp.status}`);
}
