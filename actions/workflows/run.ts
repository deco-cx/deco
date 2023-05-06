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

const verifyWithCurrentKeyOrRefetch = async (req: Request) => {
  try {
    verifySignature(req, await getOrFetchPublicKey());
  } catch (err) {
    console.log(
      "error when validating signature",
      err,
      "retrying with a new key",
    );
    key = null;
    verifySignature(req, await getOrFetchPublicKey());
  }
};
/**
 * @description Proceed the workflow execution based on the current state of the workflow.
 */
export default async function runWorkflow(
  props: Props,
  req: Request,
): Promise<Command> {
  await verifyWithCurrentKeyOrRefetch(req);
  const { metadata: { workflow } } = props;
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler(props);
}
