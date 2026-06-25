// deco-proprietary telemetry conventions, for signals that have no OTel
// semantic-conventions equivalent. Standard signals (HTTP, URL, service,
// cloud, gen_ai, ...) MUST use the official @opentelemetry/semantic-conventions
// constants re-exported from deps.ts — do not hardcode those names here.

// Metrics
export const METRIC_DECO_BLOCK_OPERATION_DURATION =
  "deco.block.operation.duration";
export const METRIC_DECO_CACHE_HITS = "deco.cache.hits";

// Attributes
export const ATTR_DECO_OPERATION_NAME = "deco.operation.name";
export const ATTR_DECO_OPERATION_ERROR = "deco.operation.error";
export const ATTR_DECO_CACHE_RESULT = "deco.cache.result";
export const ATTR_DECO_CACHE_ENGINE = "deco.cache.engine";
export const ATTR_DECO_CACHE_STATUS = "deco.cache.status";
