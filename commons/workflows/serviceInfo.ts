import {
  importJWKFromString,
  signedFetch as fetchDurableWithKey,
} from "$live/deps.ts";
import { context } from "$live/live.ts";
export const workflowServiceInfo = () =>
  context.isDeploy
    ? [
      Deno.env.get("LIVE_WORKFLOW_REGISTRY") ??
        `deco-sites.${context.site}-${context.deploymentId}@`,
      Deno.env.get("LIVE_WORKFLOW_SERVICE_URL") ??
        "https://durable-workers.deco-cx.workers.dev",
    ]
    : [
      "local-socket.",
      Deno.env.get("LIVE_WORKFLOW_SERVICE_URL") ?? "http://localhost:8001",
    ];

type FetchParams = Parameters<typeof fetch>;

const SIGNED_FETCH_PK = "SIGNED_FETCH_PRIVATE_KEY";
let pkCrypto: Promise<CryptoKey> | null = null;
const getPkCrypto = async () => {
  if (!Deno || typeof Deno === "undefined" || !Deno.env.has(SIGNED_FETCH_PK)) {
    return undefined;
  }
  const key = Deno.env.get(SIGNED_FETCH_PK);
  pkCrypto ??= importJWKFromString(key!);
  return await pkCrypto;
};
/**
 * Adds the caller signature to the headers allowing receiveirs to validate the identity of the request.
 * @param req
 * @returns
 */
export const signedFetch = async (
  input: FetchParams[0],
  init?: FetchParams[1],
) => {
  return fetchDurableWithKey(input, init, await getPkCrypto());
};
