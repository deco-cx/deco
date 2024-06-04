import {
  getProbeThresholdAsNum,
  type LiveChecker,
  type Metrics,
} from "./handler.ts";

const NAME = "UPTIME";
const MAX_UPTIME_THRESHOLD = getProbeThresholdAsNum(NAME);

export const upTimeChecker: LiveChecker = {
  name: NAME,
  checker: (metrics: Metrics) => {
    if (!MAX_UPTIME_THRESHOLD) {
      return true;
    }
    return metrics.uptime < MAX_UPTIME_THRESHOLD;
  },
};
