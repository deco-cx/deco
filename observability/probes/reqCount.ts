import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const NAME = "MAX_REQUEST_COUNT";
const MAX_REQ_THRESHOLD = getProbeThresholdAsNum(NAME);

let reqCount = 0;
export const reqCountChecker: LiveChecker = {
  name: NAME,
  observed: () => reqCount,
  beautify: (value) => {
    return {
      value,
      threshold: MAX_REQ_THRESHOLD,
    };
  },
  check: (value) => {
    if (!MAX_REQ_THRESHOLD) {
      return true;
    }
    return value < MAX_REQ_THRESHOLD!;
  },
  observe: () => {
    reqCount++;
  },
};
