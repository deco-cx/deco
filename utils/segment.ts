import type { RequestState, SegmentBuilder } from "../blocks/utils.tsx";
import { Murmurhash3 } from "../deps.ts";
import { context } from "../live.ts";

const hasher = new Murmurhash3(); // This object cannot be shared across executions when a `await` keyword is used (which is not the case here).

/**
 * initialize the segment builder
 */
export const builder = async (
  state: Partial<RequestState>,
  url: string,
): Promise<SegmentBuilder> => {
  const vary: Record<string, string> = {};
  const revision = context.release
    ? await context.release.revision()
    : undefined;
  return {
    varyWith: (key: string, val: string) => {
      vary[key] = val;
    },
    build: () => segmentFor(state, url, vary, revision),
  };
};

/**
 * Calculates the etag for the current request.
 */
export const segmentFor = (
  state: Partial<RequestState>,
  url: string,
  pageVary: Record<string, string>,
  revision?: string,
): string => {
  for (
    const [key, value] of Object.entries(pageVary).toSorted((varyA, varyB) =>
      varyA[0].localeCompare(varyB[0])
    )
  ) {
    hasher.hash(`${key}=${value}`);
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

  revision && hasher.hash(revision);
  hasher.hash(url);

  const etag = hasher.result();

  hasher.reset();

  return `${etag}`;
};
