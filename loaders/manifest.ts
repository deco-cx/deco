import { AppManifest, Apps } from "$live/blocks/app.ts";
import { context } from "$live/live.ts";
import { DecoManifest } from "$live/mod.ts";

export interface Props {
  apps: Apps[];
}

type BlockKey = keyof AppManifest;
const mergeManifests = (
  appManifest1: AppManifest,
  appManifest2: AppManifest,
) => {
  const manifestResult = { ...appManifest2, ...appManifest1 };
  for (const [key, value] of Object.entries(appManifest2)) {
    const manifestBlocks = { ...(manifestResult[key as BlockKey] ?? {}) };
    for (const [blockKey, blockFunc] of Object.entries(value)) {
      manifestBlocks[blockKey] = blockFunc;
    }
    // deno-lint-ignore no-explicit-any
    manifestResult[key as BlockKey] = manifestBlocks as any;
  }

  return manifestResult;
};

/**
 * @title Installed Apps
 */
export default function Manifest({ apps }: Props): DecoManifest {
  let { routes, islands, baseUrl, ...initialManifest } = {
    ...context.manifest!,
  };

  for (const app of (apps ?? [])) {
    initialManifest = mergeManifests(initialManifest, app?.manifest ?? {});
  }
  return { ...initialManifest, routes, islands, baseUrl };
}
