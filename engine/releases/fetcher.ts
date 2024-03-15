import { stringToHexSha256 } from "../../utils/encoding.ts";
import { randId as ulid } from "../../utils/rand.ts";
import { newFsProviderFromPath } from "./fs.ts";
import { Release } from "./provider.ts";
import { newRealtime, RealtimeReleaseProvider } from "./realtime.ts";

const releaseCache: Record<string, Promise<Release | undefined>> = {};

const ALLOWED_AUTHORITIES_ENV_VAR_NAME = "DECO_ALLOWED_AUTHORITIES";
const ALLOWED_AUTHORITIES = Deno.env.has(ALLOWED_AUTHORITIES_ENV_VAR_NAME)
  ? Deno.env.get(ALLOWED_AUTHORITIES_ENV_VAR_NAME)!.split(",")
  : ["configs.decocdn.com", "configs.deco.cx", "admin.deco.cx", "localhost"];

const fetchFromHttp = async (
  url: string | URL,
): Promise<string | undefined> => {
  const response = await fetch(String(url), { redirect: "follow" })
    .catch(
      (err) => {
        console.log("error when trying fetch from, retrying", url, err);
        return fetch(String(url), { redirect: "follow" });
      },
    );
  const content = await response.text().catch((err) => {
    console.log("err parsing text", url, err);
    return undefined;
  });
  if (response.status >= 400) {
    // ensure the body is read as to not leak resources
    console.error(
      `error fetching ${url}`,
      response.status,
      content,
    );
    return undefined;
  }
  return content;
};

type SubscribeParameters = Parameters<RealtimeReleaseProvider["subscribe"]>;
const fromEventSource = (es: EventSource): RealtimeReleaseProvider => {
  let [onChange, onError]: [
    SubscribeParameters[0] | undefined,
    SubscribeParameters[1] | undefined,
  ] = [undefined, undefined];

  const esURL = new URL(es.url);
  esURL.searchParams.set("stream", "false");

  const fetchLastState = () => {
    return fetchFromHttp(esURL).then((content) => {
      if (!content) {
        return {
          data: null,
          error: null,
        };
      }
      return {
        data: {
          state: JSON.parse(content),
          archived: {},
          revision: ulid(),
        },
        error: null,
      };
    }).catch((error) => {
      console.log("error when fetching from", esURL, error);
      return {
        data: null,
        error,
      };
    })
  }
  es.addEventListener("message", async (_event) => {
    const {data,error} = await fetchLastState();
    if (!data || error) {
      return;
    }

    onChange?.(data);
  });
  es.onerror = (event) => {
    onError?.("CLOSED", {
      cause: event,
      message: "unknown error",
      name: "SEE CLOSED",
    });
  };

  return {
    unsubscribe: () => {
      es.close();
    },
    subscribe: (change, err) => {
      onChange = change, onError = err;
    },
    get: () => {
      return fetchLastState();
    },
  };
};
const fromString = (
  endpoint: string,
  state: string,
): Release => {
  const parsed = JSON.parse(state);
  const revisionPromise = stringToHexSha256(endpoint);
  return {
    state: () => Promise.resolve(parsed),
    archived: () => Promise.resolve({}),
    onChange: () => {},
    revision: () => revisionPromise,
  };
};
async function releaseLoader(
  endpointSpecifier: string,
): Promise<Release | undefined> {
  const url = new URL(endpointSpecifier);
  const assertAllowedAuthority = () => {
    if (!ALLOWED_AUTHORITIES.includes(url.hostname)) {
      throw new Error(
        `authority ${url.hostname} is not allowed to be fetched from`,
      );
    }
  };
  try {
    switch (url.protocol) {
      case "file:": {
        return newFsProviderFromPath(url.pathname);
      }
      case "sses:":
      case "sse:": {
        assertAllowedAuthority();
        url.searchParams.set("stream", "true");
        const eventSource = new EventSource(
          url.href.replace("sse:", "http:").replace("sses:", "https:"),
        );
        const provider = fromEventSource(eventSource);
        return newRealtime(provider, true);
      }
      case "http:":
      case "https:": {
        assertAllowedAuthority();
        const content = await fetchFromHttp(url);
        return content ? fromString(endpointSpecifier, content) : undefined;
      }
      default:
        return undefined;
    }
  } catch (err) {
    console.error("error creating release from", url, err);
    return undefined;
  }
}

export const fromEndpoint = (endpoint: string): Release => {
  releaseCache[endpoint] ??= releaseLoader(endpoint);
  const releasePromise: Promise<Release> = releaseCache[endpoint].then((r) => {
    if (!r) {
      throw new Error("release not defined");
    }
    return r;
  });
  return {
    set(state, revision) {
      return releasePromise.then((r) => r?.set?.(state, revision));
    },
    state: (options) => releasePromise.then((r) => r.state(options)),
    archived: (options) => releasePromise.then((r) => r.archived(options)),
    onChange: (cb) => {
      releasePromise.then((r) => r.onChange(cb));
    },
    revision: () => releasePromise.then((r) => r.revision()),
    dispose: () => {
      releasePromise.then((r) => r?.dispose?.());
      delete releaseCache[endpoint];
    },
  };
};
