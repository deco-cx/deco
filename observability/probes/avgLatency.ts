import {
  getProbeThresholdAsNum,
  type LiveChecker,
  type Metrics,
} from "./handler.ts";

const NAME = "AVG_LATENCY";
const AVG_LATENCY_THRESHOLD = getProbeThresholdAsNum(NAME);

export const avgLatencyChecker: LiveChecker = {
  name: NAME,
  checker: (metrics: Metrics) => {
    if (!AVG_LATENCY_THRESHOLD) {
      return true;
    }
    return metrics.latency.avg < AVG_LATENCY_THRESHOLD;
  },
};
