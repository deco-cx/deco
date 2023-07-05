import {
  signedFetch,
  workflowServiceInfo,
} from "$live/commons/workflows/serviceInfo.ts";

export interface Props {
  signal: string;
  executionId: string;
  // deno-lint-ignore no-explicit-any
  payload?: any;
}

/**
 * @description Sends a signal to the workflow using the specified payload.
 */
export default async function signalWorkflow(
  { signal, payload, executionId }: Props,
): Promise<void> {
  const [_, serviceUrl] = workflowServiceInfo();
  const resp = await signedFetch(
    `${serviceUrl}/executions/${executionId}/signals/${signal}`,
    {
      method: "POST",
      body: payload ? JSON.stringify(payload) : undefined,
    },
  );
  if (!resp.ok) {
    throw new Error(`${resp.status}, ${JSON.stringify(payload)}`);
  }
}
