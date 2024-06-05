import { getProbeThresholdAsNum, type LiveChecker } from "./handler.ts";

const MINUTE = 60;
// a jitter is used to avoid multiple probes failing at the same time
const UP_TIME_JITTER_MAX_SECONDS = 5 * MINUTE;
const UP_TIME_JITTER_MIN_SECONDS = 1 * MINUTE;

const uptimeJitterSeconds =
  Math.random() * (UP_TIME_JITTER_MAX_SECONDS - UP_TIME_JITTER_MIN_SECONDS) +
  UP_TIME_JITTER_MIN_SECONDS;

const NAME = "MAX_UPTIME_SECONDS";
const MAX_UPTIME_THRESHOLD = getProbeThresholdAsNum(NAME);

export const uptimeChecker: LiveChecker = {
  name: NAME,
  get: () => Deno.osUptime(),
  print: (uptime) => {
    return {
      uptime,
      jitter: uptimeJitterSeconds,
      threshold: MAX_UPTIME_THRESHOLD,
    };
  },
  check: (uptimeSeconds) => {
    if (!MAX_UPTIME_THRESHOLD) {
      return true;
    }
    return uptimeSeconds - uptimeJitterSeconds < MAX_UPTIME_THRESHOLD;
  },
};
