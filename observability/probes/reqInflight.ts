import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const NAME = "MAX_REQUEST_INFLIGHT";
const MAX_REQ_INFLIGHT = getProbeThresholdAsNum(NAME);
let inflightCount = 0;
export const reqInflightChecker: LiveChecker = {
  name: NAME,
  observed: () => inflightCount,
  beautify: (inflight) => {
    return {
      inflight,
      threshold: MAX_REQ_INFLIGHT,
    };
  },
  check: (inflight) => {
    if (!MAX_REQ_INFLIGHT) {
      return true;
    }
    return inflight < MAX_REQ_INFLIGHT;
  },
  observe: () => {
    inflightCount++;
    return {
      end: () => {
        inflightCount--;
      },
    };
  },
};
