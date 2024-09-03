export * from "@deco/durable";
export { crypto } from "@std/crypto";
export { decodeHex, encodeHex } from "@std/encoding";
export { getCookies, getSetCookies, setCookie } from "@std/http";
export {
  DomInspector,
  DomInspectorActivators,
  inspectHandler,
} from "jsr:@deco/inspect-vscode@0.2.1";
export * as supabase from "jsr:@supabase/supabase-js@2.45.1";
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
} from "npm:@opentelemetry/api@1.9.0";
export type { Meter } from "npm:@opentelemetry/api@1.9.0";
export type {
  Attributes,
  BatchObservableResult,
  Context,
  Link,
  ObservableCounter,
  ObservableGauge,
  ObservableResult,
  ObservableUpDownCounter,
  Span,
  Tracer,
} from "npm:@opentelemetry/api@1.9.0";
export { FetchInstrumentation } from "npm:@opentelemetry/instrumentation-fetch@0.52.1";
export {
  InstrumentationBase,
  isWrapped as instrumentationIsWrapped,
  registerInstrumentations,
} from "npm:@opentelemetry/instrumentation@0.52.1";
export type { InstrumentationConfig } from "npm:@opentelemetry/instrumentation@0.52.1";
export type * from "npm:@swc/wasm@1.3.76";
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

export { OTLPTraceExporter } from "npm:@opentelemetry/exporter-trace-otlp-proto@0.52.1";
export { Resource } from "npm:@opentelemetry/resources@1.25.1";
export {
  BatchSpanProcessor,
  ParentBasedSampler,
  SamplingDecision,
  TraceIdRatioBasedSampler,
} from "npm:@opentelemetry/sdk-trace-base@1.25.1";

export type {
  Sampler,
  SamplingResult,
} from "npm:@opentelemetry/sdk-trace-base@1.25.1";
export { NodeTracerProvider } from "npm:@opentelemetry/sdk-trace-node@1.25.1";
export {
  SemanticResourceAttributes,
} from "npm:@opentelemetry/semantic-conventions@1.25.1";

export {
  ExplicitBucketHistogramAggregation,
  MeterProvider,
  PeriodicExportingMetricReader,
  View,
} from "npm:@opentelemetry/sdk-metrics@1.25.1";

export { logs, SeverityNumber } from "npm:@opentelemetry/api-logs@0.52.1";
export type { Logger } from "npm:@opentelemetry/api-logs@0.52.1";
export { OTLPLogExporter } from "npm:@opentelemetry/exporter-logs-otlp-http@0.52.1";
export { OTLPMetricExporter } from "npm:@opentelemetry/exporter-metrics-otlp-http@0.52.1";
export type { OTLPExporterNodeConfigBase } from "npm:@opentelemetry/otlp-exporter-base@0.52.1";
export {
  detectResourcesSync,
  envDetectorSync,
  hostDetectorSync,
  osDetectorSync,
  processDetector,
} from "npm:@opentelemetry/resources@1.25.1";
export {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
} from "npm:@opentelemetry/sdk-logs@0.52.1";
export type { BufferConfig } from "npm:@opentelemetry/sdk-logs@0.52.1";
export { MurmurHash3 as Murmurhash3 } from "./utils/hasher.ts";
