import { wkserviceInfo } from "./start.ts";

export interface Props {
  executionId: string;
  reason?: string;
}

export default async function cancelWorkflow(
  { reason, executionId }: Props,
): Promise<void> {
  const [_, serviceUrl] = wkserviceInfo();
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
