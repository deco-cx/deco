import { signal } from "../../commons/workflows/initialize.ts"; // side-effect initialize

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
  { signal: _signal, payload, executionId }: Props,
): Promise<void> {
  await signal(executionId, _signal, payload);
}
