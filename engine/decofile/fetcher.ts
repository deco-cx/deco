import { fromFileUrl } from "@std/path";
import { context } from "../../live.ts";
import { randId as ulid } from "../../utils/rand.ts";
import { assertAllowedAuthority as assertAllowedAuthorityFor } from "../trustedAuthority.ts";
import { newFsProviderFromPath } from "./fs.ts";
import { newFsFolderProviderFromPath } from "./fsFolder.ts";
import type { DecofileProvider, OnChangeCallback } from "./provider.ts";
import {
  newRealtime,
  type RealtimeDecofileProvider,
  type VersionedDecofile,
} from "./realtime.ts";

const decofileCache: Record<string, Promise<DecofileProvider | undefined>> = {};

export interface HttpContent {
  text: string;
  etag?: string;
}
const fetchFromHttp = async (
  url: string | URL,
): Promise<HttpContent | undefined> => {
  const response = await fetch(String(url), { redirect: "follow" })
    .then((response) => {
      if (!response.ok) {
        console.log(
          "error when trying fetch from, retrying",
          url,
          response.status,
        );
        return fetch(String(url), { redirect: "follow" });
      }
      return response;
    })
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
    if (context.isDeploy) {
      console.error("exiting due to the lack of decofile");
      Deno.exit(1);
    }
    return undefined;
  }
  return content
    ? { text: content, etag: response.headers.get("etag")?.replaceAll(`"`, "") }
    : undefined;
};

type SubscribeParameters = Parameters<RealtimeDecofileProvider["subscribe"]>;
const fromEventSource = (es: EventSource): RealtimeDecofileProvider => {
  let [onChange, onError]: [
    SubscribeParameters[0] | undefined,
    SubscribeParameters[1] | undefined,
  ] = [undefined, undefined];

  const esURL = new URL(es.url);
  esURL.searchParams.set("stream", "false");

  const fetchLastState = () => {
    return fetchFromHttp(esURL).then((httpContent) => {
      if (!httpContent) {
        return {
          data: null,
          error: null,
        };
      }
      return {
        data: {
          state: JSON.parse(httpContent.text),
          revision: httpContent.etag ?? ulid(),
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
    let data: null | VersionedDecofile = null;
    try {
      data = {
        state: JSON.parse(decodeURIComponent(event.data)),
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
export const fromHttpContent = (
  state: HttpContent,
): DecofileProvider => {
  return fromJSON(JSON.parse(state.text), state.etag);
};

export const fromJSON = (
  parsed: Record<string, unknown>,
  revision?: string,
): DecofileProvider => {
  const cbs: Array<OnChangeCallback> = [];
  let state = parsed;
  let currentRevision: string = revision ?? crypto.randomUUID();
  return {
    state: () => Promise.resolve(state),
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
async function decofileLoader(
  endpointSpecifier: string,
): Promise<DecofileProvider | undefined> {
  const url = new URL(endpointSpecifier);
  const assertAllowedAuthority = () => {
    assertAllowedAuthorityFor(url);
  };
  try {
    switch (url.protocol) {
      case "folder:": {
        return newFsFolderProviderFromPath(
          endpointSpecifier.replace("folder://", ""),
        );
      }
      case "file:": {
        return newFsProviderFromPath(fromFileUrl(url));
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
        return content ? fromHttpContent(content) : undefined;
      }
      default:
        return undefined;
    }
  } catch (err) {
    console.error("error creating decofile from", url, err);
    return undefined;
  }
}

export const fromEndpoint = (endpoint: string): DecofileProvider => {
  decofileCache[endpoint] ??= decofileLoader(endpoint);
  const decofileProviderPromise: Promise<DecofileProvider> =
    decofileCache[endpoint]
      .then(
        (r) => {
          if (!r) {
            throw new Error("decofile not defined");
          }
          return r;
        },
      );
  return {
    set(state, revision) {
      return decofileProviderPromise.then((r) => r?.set?.(state, revision));
    },
    notify() {
      return decofileProviderPromise.then((r) =>
        r?.notify?.() ?? Promise.resolve()
      );
    },
    state: (options) => decofileProviderPromise.then((r) => r.state(options)),
    onChange: (cb) => {
      decofileProviderPromise.then((r) => r.onChange(cb));
    },
    revision: () => decofileProviderPromise.then((r) => r.revision()),
    dispose: () => {
      decofileProviderPromise.then((r) => r?.dispose?.());
      delete decofileCache[endpoint];
    },
  };
};
