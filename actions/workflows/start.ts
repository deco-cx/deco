// deno-lint-ignore-file no-explicit-any
import { workflowServiceInfo } from "$live/commons/workflows/serviceInfo.ts";
import {
  toExecution,
  WorkflowExecution,
} from "$live/commons/workflows/types.ts";

export interface Props<
  TWorkflow extends `${string}/workflows/${string}` =
    `${string}/workflows/${string}`,
> {
  workflow: TWorkflow;
  id?: string;
  props?: any;
  args?: any[];
}

export default async function startWorkflow(
  { workflow, props, args, id }: Props,
): Promise<WorkflowExecution> {
  const [service, serviceUrl] = workflowServiceInfo();
  const payload = {
    alias: `${service}/live/invoke/$live/actions/workflows/run.ts`,
    id,
    input: args,
    metadata: {
      workflow: {
        ...props,
        __resolveType: workflow,
      },
      __resolveType: "resolve",
    },
  };
  const resp = await fetch(`${serviceUrl}/executions`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (resp.ok) {
    return toExecution(await resp.json());
  }
  throw new Error(`${resp.status}, ${JSON.stringify(payload)}`);
}
