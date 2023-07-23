import { get } from "$live/commons/workflows/initialize.ts"; // side-effect initialize
import {
  toExecution,
  WorkflowExecution,
  WorkflowMetadata,
} from "$live/commons/workflows/types.ts";
import { Arg } from "$live/deps.ts";
export interface Props {
  id: string;
}

/**
 * @description Read the workflow execution information.
 */
export default function getExecution(
  { id }: Props,
): Promise<WorkflowExecution | null> {
  return get<Arg, unknown, WorkflowMetadata>(id).then((wkflow) =>
    wkflow ? toExecution(wkflow) : wkflow
  );
}
