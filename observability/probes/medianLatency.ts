import { Median } from "../../utils/stat.ts";
import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const NAME = "MAX_MEDIAN_LATENCY";
const MEDIAN_LATENCY_THRESHOLD = getProbeThresholdAsNum(NAME);

const latMedian = new Median();

export const medianLatencyChecker: LiveChecker = {
  name: NAME,
  get: () => latMedian.get(),
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
      return;
    }
    const start = performance.now();
    return {
      end: () => {
        latMedian.add(performance.now() - start);
      },
    };
  },
};
