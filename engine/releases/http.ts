import { stringToHexSha256 } from "../../utils/encoding.ts";
import { Release } from "./provider.ts";

export const fromHttp = (endpoint: string): Release => {
  let retries = 3;
  const fetchFromEndpoint = (): Promise<Record<string, unknown>> =>
    fetch(endpoint)
      .then(async (response) =>
        response.ok
          ? await response.json()
          : await (async () => {
              throw new Error(
                `failed to fetch config from ${endpoint} error ${
                  response.status
                } ${await response.text()}`
              );
            })()
      )
      .catch((err) => {
        if (retries === 0) {
          throw err;
        }
        console.error(
          `error fetching from endpoint ${endpoint}, retrying ${retries}`
        );
        retries--;
        return fetchFromEndpoint();
      });
  const revisionPromise = stringToHexSha256(endpoint);

  const state: Promise<Record<string, unknown>> = fetchFromEndpoint();
  return {
    state: () => state,
    archived: () => Promise.resolve({}),
    onChange: () => {},
    revision: () => revisionPromise,
  };
};
