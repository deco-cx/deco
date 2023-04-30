import { wkserviceInfo } from "$live/actions/workflows/start.ts";
import { WorkflowExecution } from "$live/deps.ts";
export interface Props {
  id: string;
}

export default async function getExecutions(
  { id }: Props,
): Promise<WorkflowExecution> {
  const [_, svcUrl] = wkserviceInfo();

  const resp = await fetch(`${svcUrl}/executions/${id}`);
  if (resp.ok) {
    return resp.json();
  }
  throw new Error(`${resp.status}`);
}
