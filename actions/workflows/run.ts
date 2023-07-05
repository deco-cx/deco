import { Workflow, WorkflowContext } from "$live/blocks/workflow.ts";
import {
  Arg,
  Command,
  InvalidSignatureError,
  Metadata,
  RunRequest,
  fetchPublicKey,
  verifySignature,
  workflowRemoteRunner,
} from "$live/deps.ts";
import { asResolved, isResolved } from "$live/engine/core/resolver.ts";
import { workflowServiceInfo } from "../../commons/workflows/serviceInfo.ts";

export type Props = RunRequest<Arg, { workflow: Workflow } & Metadata>;

let key: Promise<JsonWebKey> | null = null;

const getOrFetchPublicKey = (): Promise<JsonWebKey> => {
  const [_, serviceUrl] = workflowServiceInfo();
  return key ??= fetchPublicKey(serviceUrl);
};

const verifyWithCurrentKeyOrRefetch = async (req: Request) => {
  try {
    await verifySignature(req, getOrFetchPublicKey());
  } catch (err) {
    if (!(err instanceof InvalidSignatureError)) {
      throw err;
    }
    console.log(
      "error when validating signature",
      err,
      "retrying with a new key",
    );
    key = null;
    await verifySignature(req, getOrFetchPublicKey());
  }
};

/**
 * Check if the request comes from durable and its signature is valid.
 */
export const isValidRequestFromDurable = async (req: Request) => {
  try {
    await verifyWithCurrentKeyOrRefetch(req);
    return true;
  } catch {
    return false;
  }
};
/**
 * @description Proceed the workflow execution based on the current state of the workflow.
 */
export default async function runWorkflow(
  props: Props,
  req: Request,
): Promise<Command> {
  // TODO (mcandeia) for some reason this is not properly working.
  // This should not be necessary since onBeforeResolveProps should preemptively shortcircuit the results resolution.
  const results = isResolved(props.results)
    ? props.results.data
    : props.results;
  await verifyWithCurrentKeyOrRefetch(req);
  const { metadata: { workflow } } = props;
  const handler = workflowRemoteRunner(workflow, WorkflowContext);
  return handler({ ...props, results });
}

export const onBeforeResolveProps = (props: Props) => {
  return { ...props, results: asResolved(props.results) };
};
