// deno-lint-ignore-file no-deprecated-deno-api
import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const NAME = "OPENED_RESOURCES";
const MAX_RESOURCES_OPENED = getProbeThresholdAsNum(NAME);
export const resourcesChecker: LiveChecker<Deno.ResourceMap> = {
  name: NAME,
  observed: () => Deno.resources(),
  beautify: (resources) => {
    return {
      opened: Object.keys(resources).length,
      max: MAX_RESOURCES_OPENED,
      resources,
    };
  },
  check: (resources) => {
    if (!MAX_RESOURCES_OPENED) {
      return true;
    }
    const total = Object.keys(resources).length;
    return total < MAX_RESOURCES_OPENED;
  },
};
