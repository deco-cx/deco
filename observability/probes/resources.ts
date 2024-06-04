import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const NAME = "OPENED_RESOURCES";
const MAX_RESOURCES_OPENED = getProbeThresholdAsNum(NAME);
export const resourcesChecker: LiveChecker = {
  name: NAME,
  checker: () => {
    if (!MAX_RESOURCES_OPENED) {
      return true;
    }
    // deno-lint-ignore no-deprecated-deno-api
    const resources = Deno.resources();
    const total = Object.keys(resources).length;
    return total < MAX_RESOURCES_OPENED;
  },
};
