import { Median } from "../../utils/stat.ts";
import { getProbeThresholdAsNum, type LiveChecker, NOOP } from "./handler.ts";

const NAME = "MAX_MEDIAN_LATENCY";
const MEDIAN_LATENCY_THRESHOLD = getProbeThresholdAsNum(NAME);

const latMedian = new Median();

export const medianLatencyChecker: LiveChecker = {
  name: NAME,
  observed: () => latMedian.get(),
  print: (latency) => ({
    latency,
    threshold: MEDIAN_LATENCY_THRESHOLD,
  }),
  check: (value) => {
    if (!MEDIAN_LATENCY_THRESHOLD) {
      return true;
    }
    return value < MEDIAN_LATENCY_THRESHOLD;
  },
  observe: () => {
    if (!MEDIAN_LATENCY_THRESHOLD) {
      return NOOP;
    }
    const start = performance.now();
    return {
      end: () => {
        latMedian.add(performance.now() - start);
      },
    };
  },
};
