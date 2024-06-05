import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const NAME = "UPTIME";
const MAX_UPTIME_THRESHOLD = getProbeThresholdAsNum(NAME);

export const upTimeChecker: LiveChecker = {
  name: NAME,
  observed: () => Deno.osUptime(),
  beautify: (value) => {
    return {
      value,
      threshold: MAX_UPTIME_THRESHOLD,
    };
  },
  check: (uptime) => {
    if (!MAX_UPTIME_THRESHOLD) {
      return true;
    }
    return uptime < MAX_UPTIME_THRESHOLD;
  },
};
