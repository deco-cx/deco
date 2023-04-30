// deno-lint-ignore-file no-explicit-any
import { WorkflowExecution } from "$durable/mod.ts";
export interface Props {
  workflow: string;
  service?: string;
  props?: any;
  args?: any[];
}

const defaultService = "http:/localhost:8001";
export default async function startWorkflow(
  { workflow, service, props, args }: Props,
): Promise<WorkflowExecution> {
    /// TODO criar um /live/invoke/...path pra funcionar tambem passar a key na URL
  const payload = {
    alias: `local./live/invoke/actions/workflows/run.ts?${workflow}?props=${
      btoa(encodeURIComponent(JSON.stringify(props)))
    }`,
    input: args,
  };
  const resp = await fetch(`${service ?? defaultService}/executions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (resp.ok) {
    return resp.json();
  }
  throw new Error(`${resp.status}, ${JSON.stringify(payload)}`);
}
