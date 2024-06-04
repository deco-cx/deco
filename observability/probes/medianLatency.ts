import {
    getProbeThresholdAsNum,
    type LiveChecker,
    type Metrics,
} from "./handler.ts";

const NAME = "MEDIAN_LATENCY";
const MEDIAN_LATENCY_THRESHOLD = getProbeThresholdAsNum(NAME);

export const medianLatencyChecker: LiveChecker = {
  name: NAME,
  checker: (metrics: Metrics) => {
    if (!MEDIAN_LATENCY_THRESHOLD) {
      return true;
    }
    return metrics.latency.median < MEDIAN_LATENCY_THRESHOLD;
  },
};
