import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import {
  toExecution,
  WorkflowExecution,
} from "$live/commons/workflows/types.ts";
export interface Props {
  id: string;
}

export default async function getExecutions(
  { id }: Props,
): Promise<WorkflowExecution> {
  const [_, svcUrl] = workflowServiceInfo();

  const resp = await fetch(`${svcUrl}/executions/${id}`);
  if (resp.ok) {
    return toExecution(await resp.json());
  }
  throw new Error(`${resp.status}`);
}
