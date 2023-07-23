import {
  Arg,
  cancel as durableCancel,
  get as durableGet,
  history as durableHistory,
  init,
  signal as durableSignal,
  start as durableStart,
} from "$live/deps.ts";
import { context } from "$live/live.ts";

const initializeOnceWhen = <TArgs extends Arg = Arg, TResult = unknown>(
  f: (...args: [...TArgs]) => TResult,
): (...args: [...TArgs]) => TResult => {
  return (...args: [...TArgs]) => {
    initOnce();
    return f(...args);
  };
};

let initialized = false;
export const initOnce = () => {
  if (initialized) {
    return;
  }
  initialized = true;
  const setupLocal = {
    durableEndpoint: "http://localhost:8001",
    namespace: "x",
    audience: `urn:deco:site::samples:`,
    token:
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJ1cm46ZGVjbzpzaXRlOjphZG1pbjpkZXBsb3ltZW50L3RzdCIsInN1YiI6InVybjpkZWNvOnNpdGU6Ong6ZGVwbG95bWVudC90c3QiLCJzY29wZXMiOlsiaHR0cDovL2xvY2FsaG9zdDo4MDAwLyoiLCJ3czovL2xvY2FsaG9zdDo4MDAwLyoiXX0.awdXDppwF-Dn7BwMWLz3hHqlx16HfVBuPuoGP4mVBihkMxwqDvZYWi_1Dg27u6ajg9br9qL6xSTlN8nauo89AyELaQavUIPDnW5u1yZpVZ5XE1C7DyVc3ncGe8L_PjuRqkfkc24POCiPVALYqKpJ7uERkjoSSRT5BBbuPvuWYZQaeNpkw6CUKWzod9myg7evtbIBEuLHnNyhT2hKmdzLuJNzakS-cyZVIQ6Pm_JDTQhdH15QyDNviJ6tM6HrNARgti40QUOAwRpACLZ16LsEpAitaZPBx7KNDr456indBP_HqZF6crO3yUQEFSN5Yb323VLjtaX2SVSqIP0uOLn0yA",
  };
  const setupRemote = {
    durableEndpoint: Deno.env.get("LIVE_DURABLE_SERVICE_URL") ??
      "https://durable-workers.deco-cx.workers.dev",
    namespace: context.site,
    audience:
      `urn:deco:site::${context.site}:deployment/${context.deploymentId}`,
    token: Deno.env.get("DURABLE_TOKEN"),
  };
  init(context.isDeploy ? setupRemote : setupLocal);
};

export const cancel = initializeOnceWhen(durableCancel);
export const get = initializeOnceWhen(durableGet);
export const history = initializeOnceWhen(durableHistory);
export const signal = initializeOnceWhen(durableSignal);
export const start = initializeOnceWhen(durableStart);
