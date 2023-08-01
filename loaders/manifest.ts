import { Pack } from "$live/blocks/pack.ts";
import { context } from "$live/live.ts";
import type { DecoManifest } from "$live/mod.ts";

export interface Props {
  packs: Pack[];
}

type BlockKey = keyof Omit<DecoManifest, "routes" | "islands" | "baseUrl">;
const mergeManifests = (man1: DecoManifest, man2: DecoManifest) => {
  const {
    routes: _doNotMergeRoutes,
    islands: _doNotMergeIslands,
    baseUrl: _ignoreBaseUrl,
    ...blocks2
  } = man2;

  const manifestResult = { ...man2, ...man1 };
  for (const [key, value] of Object.entries(blocks2)) {
    const manifestBlocks = { ...(manifestResult[key as BlockKey] ?? {}) };
    for (const [blockKey, blockFunc] of Object.entries(value)) {
      manifestBlocks[blockKey] = blockFunc;
    }
    // deno-lint-ignore no-explicit-any
    manifestResult[key as BlockKey] = manifestBlocks as any;
  }

  return manifestResult;
};
export default function Manifest({ packs }: Props): DecoManifest {
  let initialManifest = { ...context.manifest! };

  for (const pack of packs) {
    initialManifest = mergeManifests(initialManifest, pack);
  }
  return initialManifest;
}
