// deco-proprietary telemetry conventions, for signals that have no OTel
// semantic-conventions equivalent. Standard signals (HTTP, URL, service,
// cloud, gen_ai, ...) MUST use the official @opentelemetry/semantic-conventions
// constants re-exported from deps.ts — do not hardcode those names here.

// Metrics
export const METRIC_DECO_BLOCK_OPERATION_DURATION =
  "deco.block.operation.duration";
// Single cache counter dimensioned by `deco.cache.status` — follows the OTel
// semconv pattern (cf. nfs.server.repcache.requests + .status) and the general
// guidance to prefer attributes over separate metrics. Unified with
// @decocms/start so both frameworks aggregate on the same series.
export const METRIC_DECO_CACHE_REQUESTS = "deco.cache.requests";

// Attributes
export const ATTR_DECO_OPERATION_NAME = "deco.operation.name";
export const ATTR_DECO_OPERATION_ERROR = "deco.operation.error";
export const ATTR_DECO_CACHE_ENGINE = "deco.cache.engine";
// Cache outcome: hit | stale | miss (| bypass). Same key on span + metric.
export const ATTR_DECO_CACHE_STATUS = "deco.cache.status";

// Vendored copies of EXPERIMENTAL (incubating) OTel semconv attribute names.
// OTel recommends libraries NOT import from `@opentelemetry/.../incubating`
// (the entry point is unstable across versions); copy the values instead.
// Sourced from @opentelemetry/semantic-conventions 1.37.0/incubating.
export const ATTR_CLOUD_PROVIDER = "cloud.provider";
export const ATTR_CLOUD_REGION = "cloud.region";
export const ATTR_DEPLOYMENT_ENVIRONMENT_NAME = "deployment.environment.name";
export const ATTR_SERVICE_INSTANCE_ID = "service.instance.id";
