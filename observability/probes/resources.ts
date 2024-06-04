import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const NAME = "OPENED_RESOURCES";
const MAX_RESOURCES_OPENED = getProbeThresholdAsNum(NAME);
export const resourcesChecker: LiveChecker = {
  name: NAME,
  checker: ({ resources }) => {
    if (!MAX_RESOURCES_OPENED) {
      return true;
    }
    const total = Object.keys(resources).length;
    return total < MAX_RESOURCES_OPENED;
  },
};
