import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import { WorkflowExecution } from "$live/deps.ts";
export interface Props {
  id: string;
  page?: number;
  pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 10;

/**
 * @description Get the workflow execution events.
 */
export default async function getExecutionEvents(
  { id, page, pageSize }: Props,
): Promise<WorkflowExecution> {
  const [_, svcUrl] = workflowServiceInfo();

  const resp = await fetch(
    `${svcUrl}/executions/${id}/history?page=${page ?? 0}&pageSize=${
      pageSize ?? DEFAULT_PAGE_SIZE
    }`,
  );
  if (resp.ok) {
    return resp.json();
  }
  throw new Error(`${resp.status}`);
}
