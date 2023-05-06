import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import {
  Arg,
  Command,
  fetchPublicKey,
  RunRequest,
  verifySignature,
  workflowRemoteRunner,
} from "$live/deps.ts";
import { workflowServiceInfo } from "../../commons/workflows/serviceInfo.ts";

export type Props = RunRequest<Arg, { workflow: Workflow }>;

let key: Promise<JsonWebKey> | null = null;

const getOrFetchPublicKey = (): Promise<JsonWebKey> => {
  const [_, serviceUrl] = workflowServiceInfo();
  return key ??= fetchPublicKey(serviceUrl);
};
/**
 * @description Proceed the workflow execution based on the current state of the workflow.
 */
export default async function runWorkflow(
  props: Props,
  req: Request,
): Promise<Command> {
  verifySignature(req, await getOrFetchPublicKey());
  const { metadata: { workflow } } = props;
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler(props);
}
