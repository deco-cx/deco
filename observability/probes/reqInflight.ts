import {
    getProbeThresholdAsNum,
    type LiveChecker,
    type Metrics,
} from "./handler.ts";

const NAME = "MAX_REQUEST_INFLIGHT";
const MAX_REQ_INFLIGHT = getProbeThresholdAsNum(NAME);

export const reqInflightChecker: LiveChecker = {
  name: NAME,
  checker: ({ requests: { inflight } }: Metrics) => {
    if (!MAX_REQ_INFLIGHT) {
      return true;
    }
    return inflight < MAX_REQ_INFLIGHT;
  },
};
