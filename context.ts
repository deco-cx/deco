import type { DecoManifest, LiveOptions } from "./types.ts";

type EnhancedLiveOptions = LiveOptions & { siteId?: number };

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
let manifest: DecoManifest;
let liveOptions: EnhancedLiveOptions;
const defaultDomains = [
  `localhost`,
];

export function getDefaultDomains() {
  return defaultDomains;
}

export function pushDefaultDomains(...domains: string[]) {
  defaultDomains.push(...domains);
}

export function getManifest() {
  return manifest;
}

export function setManifest(newManifest: DecoManifest) {
  manifest = newManifest;
}

export function getLiveOptions() {
  return liveOptions;
}

export function setLiveOptions(newLiveOptions: EnhancedLiveOptions) {
  liveOptions = newLiveOptions;
}
