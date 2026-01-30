export * from "@deco/durable";
export { crypto } from "@std/crypto";
export { decodeHex, encodeHex } from "@std/encoding";
export { getCookies, getSetCookies, setCookie } from "@std/http";
export {
  DomInspector,
  DomInspectorActivators,
  inspectHandler,
} from "jsr:@deco/inspect-vscode@0.2.1";

// @opentelemetry/api is ESM-safe (pure API layer, no Node.js require())
// All other OpenTelemetry packages are loaded dynamically in observability/otel/init.ts
export {
  context,
  createContextKey,
  default as opentelemetry,
  diag,
  DiagConsoleLogger,
  DiagLogLevel,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  ValueType,
} from "@opentelemetry/api";
export type {
  Attributes,
  BatchObservableResult,
  Context,
  Exception,
  Link,
  Meter,
  ObservableCounter,
  ObservableGauge,
  ObservableResult,
  ObservableUpDownCounter,
  Span,
  Tracer,
} from "@opentelemetry/api";

export type {
  JSONSchema7,
  JSONSchema7Definition,
  JSONSchema7Type,
  JSONSchema7TypeName,
} from "npm:@types/json-schema@7.0.11/index.d.ts";
export type {
  DeepPartial,
  Diff,
  Intersection,
  OptionalKeys,
  Overwrite,
  RequiredKeys,
  UnionToIntersection,
} from "npm:utility-types@3.10.0";
export * as weakcache from "npm:weak-lru-cache@1.0.0";
export type Handler = Deno.ServeHandler;

// NOTE: The following OpenTelemetry packages use Node.js require() and are
// incompatible with Vite SSR. They are now loaded dynamically in
// observability/otel/init.ts:
//
// - @opentelemetry/resources (uses require() for machine-id detection)
// - @opentelemetry/sdk-metrics (depends on resources)
// - @opentelemetry/sdk-trace-base (depends on resources)
// - @opentelemetry/sdk-trace-node (uses require-in-the-middle)
// - @opentelemetry/sdk-logs (depends on resources)
// - @opentelemetry/instrumentation (uses require-in-the-middle)
// - @opentelemetry/instrumentation-fetch (depends on instrumentation)
// - @opentelemetry/exporter-* (various Node.js dependencies)

export { MurmurHash3 as Murmurhash3 } from "./utils/hasher.ts";
