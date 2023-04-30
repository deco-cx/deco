import { wkserviceInfo } from "./start.ts";

export interface Props {
  signal: string;
  executionId: string;
  payload?: unknown;
}

export default async function signalWorkflow(
  { signal, payload, executionId }: Props,
): Promise<void> {
  const [_, serviceUrl] = wkserviceInfo();
  const resp = await fetch(
    `${serviceUrl}/executions/${executionId}/signals/${signal}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  if (!resp.ok) {
    throw new Error(`${resp.status}, ${JSON.stringify(payload)}`);
  }
}
