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
  const payload = {
    alias: "local./live/invoke/$live/actions/workflows/run.ts",
    input: args,
    metadata: {
      workflow: {
        ...props,
        __resolveType: workflow,
      },
      __resolveType: "resolve"
    },
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
