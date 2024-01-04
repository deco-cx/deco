import { stringToHexSha256 } from "../../utils/encoding.ts";
import { Release } from "./provider.ts";

const endpointCache: Record<string, Promise<Record<string, unknown>>> = {};

async function endpointLoader(
  endpointSpecifier: string,
): Promise<string | undefined> {
  const url = new URL(endpointSpecifier);
  try {
    switch (url.protocol) {
      case "file:": {
        return await Deno.readTextFile(url);
      }
      case "http:":
      case "https:": {
        const response = await fetch(String(url), { redirect: "follow" }).catch(
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
      }
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
}
export const fromEndpoint = (endpoint: string): Release => {
  const revisionPromise = stringToHexSha256(endpoint);

  endpointCache[endpoint] ??= endpointLoader(endpoint).then(
    (content) => content ? JSON.parse(content) : {},
  );
  return {
    state: () => endpointCache[endpoint],
    archived: () => Promise.resolve({}),
    onChange: () => {},
    revision: () => revisionPromise,
  };
};
