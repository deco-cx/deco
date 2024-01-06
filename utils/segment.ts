import { getSetCookies } from "std/http/cookie.ts";
import { DECO_MATCHER_PREFIX } from "../blocks/matcher.ts";
import type { RequestState } from "../blocks/utils.tsx";
import { Murmurhash3 } from "../deps.ts";
import { Context } from "../deco.ts";

const hasher = new Murmurhash3(); // This object cannot be shared across executions when a `await` keyword is used (which is not the case here).

/**
 * Calculates the etag for the current request.
 */
export const segmentFor = async (
  state: Partial<RequestState>,
  url: string,
): Promise<string> => {
  const context = Context.active();
  const cookies = getSetCookies(state?.response?.headers ?? new Headers());
  // sort cookie to calculate stable etags
  for (
    const cookie of cookies.toSorted((cookieA, cookieB) =>
      cookieA.name.localeCompare(cookieB.name)
    )
  ) {
    if (!cookie.name.startsWith(DECO_MATCHER_PREFIX)) {
      hasher.hash(`${cookie.name}${cookie.value}`);
    }
  }
  for (
    const flag
      of (state?.flags?.toSorted((flagA, flagB) =>
        flagA.name.localeCompare(flagB.name)
      ) ?? [])
  ) {
    hasher.hash(`${flag.name}${flag.value}`);
  }

  if (context.deploymentId) {
    hasher.hash(context.deploymentId);
  }

  if (context.release) {
    hasher.hash(await context.release.revision());
  }
  hasher.hash(url);

  const etag = hasher.result();

  hasher.reset();

  return `${etag}`;
};
