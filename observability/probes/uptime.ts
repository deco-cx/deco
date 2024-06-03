import {
  getProbeThresholdAsNum,
  type LiveChecker,
  type Metrics,
} from "./handler.ts";

const NAME = "UPTIME";
const MAX_REQ_THRESHOLD = getProbeThresholdAsNum(NAME);

export const upTimeChecker: LiveChecker = {
  name: NAME,
  checker: (metrics: Metrics) => {
    if (!MAX_REQ_THRESHOLD) {
      return true;
    }
    return metrics.uptime < MAX_REQ_THRESHOLD;
  },
};
