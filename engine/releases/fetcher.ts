import { randId as ulid } from "../../utils/rand.ts";
import { assertAllowedAuthority as assertAllowedAuthorityFor } from "../trustedAuthority.ts";
import { newFsProviderFromPath } from "./fs.ts";
import { OnChangeCallback, Release } from "./provider.ts";
import {
  CurrResolvables,
  newRealtime,
  RealtimeReleaseProvider,
} from "./realtime.ts";

const releaseCache: Record<string, Promise<Release | undefined>> = {};

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
    });
  };
  es.addEventListener("message", async (event) => {
    let data: null | CurrResolvables = null;
    try {
      data = {
        state: JSON.parse(decodeURIComponent(event.data)),
        archived: {},
        revision: ulid(),
      };
    } catch {
      const { data: mdata, error } = await fetchLastState();
      if (!data || error) {
        return;
      }
      data = mdata;
    }

    onChange?.(data!);
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
export const fromString = (
  state: string,
): Release => {
  return fromJSON(JSON.parse(state));
};

export const fromJSON = (
  parsed: Record<string, unknown>,
): Release => {
  const cbs: Array<OnChangeCallback> = [];
  let state = parsed;
  let currentRevision: string = crypto.randomUUID();
  return {
    state: () => Promise.resolve(state),
    archived: () => Promise.resolve({}),
    onChange: (cb) => {
      cbs.push(cb);
    },
    notify: () => {
      return Promise.all(cbs.map((cb) => cb())).then(() => {});
    },
    revision: () => Promise.resolve(currentRevision),
    set(newState, revision) {
      state = newState;
      currentRevision = revision ?? crypto.randomUUID();
      return Promise.all(cbs.map((cb) => cb())).then(() => {});
    },
  };
};
async function releaseLoader(
  endpointSpecifier: string,
): Promise<Release | undefined> {
  const url = new URL(endpointSpecifier);
  const assertAllowedAuthority = () => {
    assertAllowedAuthorityFor(url);
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
        return content ? fromString(content) : undefined;
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
    notify() {
      return releasePromise.then((r) => r?.notify?.() ?? Promise.resolve());
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
