import { Pack } from "$live/blocks/pack.ts";
import { context } from "$live/live.ts";

export interface Props {
  packs: Pack[];
}

type BlockKey = keyof Pack;
const mergeManifests = (man1: Pack, man2: Pack) => {
  const manifestResult = { ...man2, ...man1 };
  for (const [key, value] of Object.entries(man2)) {
    const manifestBlocks = { ...(manifestResult[key as BlockKey] ?? {}) };
    for (const [blockKey, blockFunc] of Object.entries(value)) {
      manifestBlocks[blockKey] = blockFunc;
    }
    // deno-lint-ignore no-explicit-any
    manifestResult[key as BlockKey] = manifestBlocks as any;
  }

  return manifestResult;
};

export default function Manifest({ packs }: Props): Pack {
  let { routes, islands, baseUrl, ...initialManifest } = {
    ...context.manifest!,
  };

  for (const pack of packs) {
    initialManifest = mergeManifests(initialManifest, pack);
  }
  return { ...initialManifest, routes, islands, baseUrl } as Pack;
}
