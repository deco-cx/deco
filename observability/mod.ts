// Import from lazy modules to avoid module-level OpenTelemetry initialization
export { logger } from "./otel/config-lazy.ts";
export { meter } from "./otel/metrics-lazy.ts";
