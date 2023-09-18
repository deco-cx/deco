// deno-lint-ignore-file no-explicit-any
import { S3Client } from "https://deno.land/x/s3_lite_client@0.6.1/mod.ts";
import { Resolvable } from "../../engine/core/resolver.ts";
import { singleFlight } from "../../engine/core/utils.ts";
import {
  OnChangeCallback,
  ReadOptions,
  Release,
} from "./provider.ts";
import { stringToHexSha256 } from "../../utils/encoding.ts";

const CLOUDFLARE_R2_ACCESS_KEY = Deno.env.get("CLOUDFLARE_R2_ACCESS_KEY");
const CLOUDFLARE_R2_SECRET_KEY = Deno.env.get("CLOUDFLARE_R2_SECRET_KEY");
const CLOUDFLARE_R2_ENDPOINT = Deno.env.get("CLOUDFLARE_R2_ENDPOINT")!;

const CONFIG_BUCKET_NAME = "configs";

const s3client = new S3Client({
  endPoint: CLOUDFLARE_R2_ENDPOINT ?? "r2.cloudflarestorage.com",
  port: 443,
  useSSL: true,
  region: "us-east-1",
  bucket: CONFIG_BUCKET_NAME,
  pathStyle: false,
  accessKey: CLOUDFLARE_R2_ACCESS_KEY,
  secretKey: CLOUDFLARE_R2_SECRET_KEY,
});

interface CurrResolvables {
  state: Record<string, Resolvable<any>>;
  archived: Record<string, Resolvable<any>>;
}

const sleepBetweenRetriesMS = 100;
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let currentRevision = "unknown";
export const newCloudflareProvider = (site: string, listenForUpdates: boolean): Release => {
  const onChangeCbs: OnChangeCallback[] = [];
  const notify = () => {
    onChangeCbs.forEach((cb) => cb());
  };

  const sf = singleFlight<CurrResolvables | undefined>();
  const getConfig = () =>
    sf.do(
      "flight",
      async () => {
        const response = await s3client.getObject(site);
        if (!response) {
          return undefined;
        }
        const json = await new Response(response.body).text();
        return JSON.parse(json);
      }
    );

  // the first load retry attempts
  let remainingRetries = 5;
  // the last error based on the retries
  let lastError: Error

  // the first load is required as the isolate should not depend on any background behavior to work properly.
  // so this method retries 5 times with a 100ms delay between each attempt otherwise the promise will be rejected.
  const tryResolveFirstLoad = async (
    resolve: (
      value:
        | CurrResolvables
        | PromiseLike<CurrResolvables>,
    ) => void,
    reject: (reason: unknown) => void,
  ) => {
    if (remainingRetries === 0) {
      reject(lastError); // TODO @author Marcos V. Candeia should we panic? and exit? Deno.exit(1)
      return;
    }
    try {
      const data = await getConfig();
      if (!data) {
        throw new Error("could not get config from cloudflare");
      }
      resolve(data);
    } catch (error) {
      remainingRetries--;
      lastError = error;
      await sleep(sleepBetweenRetriesMS);
      await tryResolveFirstLoad(resolve, reject);
      return;
    }
  };

  let currResolvables: Promise<CurrResolvables> = new Promise<
    CurrResolvables
  >(tryResolveFirstLoad);

  let sFlight = false;
  const updateInternalState = async (force?: boolean) => {
    if (sFlight && !force) {
      return;
    }
    try {
      sFlight = true;
      const resolvables = await getConfig();
      if (!resolvables) {
        return;
      }
      currResolvables = Promise.resolve(
        resolvables,
      );
      const nextRevision = await stringToHexSha256(JSON.stringify(resolvables));
      if (currentRevision !== nextRevision) {
        currentRevision = nextRevision;
        notify();
      }
    } finally {
      sFlight = false;
    }
  };

  if (listenForUpdates) {
    const channel = new BroadcastChannel(site);
    channel.onmessage = (_: MessageEvent) => {
      updateInternalState();
    }
  }

  return {
    archived: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState(true);
      }
      const resolvables = await currResolvables;
      return resolvables.archived;
    },
    onChange: (cb: OnChangeCallback) => {
      onChangeCbs.push(cb);
    },
    revision: () => Promise.resolve(currentRevision),
    state: async (opts?: ReadOptions) => {
      if (opts?.forceFresh) {
        await updateInternalState(true);
      }
      const resolvables = await currResolvables;
      return resolvables.state;
    },
  };
}