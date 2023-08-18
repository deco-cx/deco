import { get } from "../../commons/workflows/initialize.ts"; // side-effect initialize
import {
  toExecution,
  WorkflowExecution,
  WorkflowMetadata,
} from "../../commons/workflows/types.ts";
import { Arg } from "../../deps.ts";
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
