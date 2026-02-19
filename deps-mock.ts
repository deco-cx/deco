// Complete mock of OpenTelemetry - does nothing, just returns no-op objects
// Use this to test if OTEL is actually the startup bottleneck

export * from "@deco/durable";
export { crypto } from "@std/crypto";
export { decodeHex, encodeHex } from "@std/encoding";
export { getCookies, getSetCookies, setCookie } from "@std/http";
export {
  DomInspector,
  DomInspectorActivators,
  inspectHandler,
} from "jsr:@deco/inspect-vscode@0.2.1";

// Mock OpenTelemetry API - all no-ops
export const context = {
  active: () => ({
    setValue: () => ({}),
    getValue: () => undefined,
  }),
};

export const createContextKey = () => Symbol();

export const opentelemetry = {
  trace: {
    getTracer: () => ({
      startSpan: () => noopSpan,
      startActiveSpan: (_name: string, _options: any, _context: any, fn: Function) => fn(noopSpan),
    }),
  },
};

const noopSpan = {
  end: () => {},
  setAttribute: () => {},
  setAttributes: () => {},
  setStatus: () => {},
  recordException: () => {},
  updateName: () => {},
  isRecording: () => false,
};

export const diag = {
  setLogger: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const DiagConsoleLogger = class {};
export const DiagLogLevel = { INFO: 0 };
export const ROOT_CONTEXT = {};
export const SpanKind = { INTERNAL: 0, SERVER: 1, CLIENT: 2 };
export const SpanStatusCode = { ERROR: 2, OK: 1, UNSET: 0 };
export const trace = opentelemetry.trace;
export const ValueType = { DOUBLE: 2, INT: 1 };

// Mock types
export type Attributes = Record<string, any>;
export type BatchObservableResult = any;
export type Context = any;
export type Exception = Error;
export type Link = any;
export type Meter = any;
export type ObservableCounter = any;
export type ObservableGauge = any;
export type ObservableResult = any;
export type ObservableUpDownCounter = any;
export type Span = typeof noopSpan;
export type Tracer = any;

// Mock instrumentation
export class FetchInstrumentation {
  constructor(_config?: any) {}
}

export class InstrumentationBase {
  constructor() {}
}

export const isWrapped = () => false;
export const registerInstrumentations = () => {};

export type InstrumentationConfig = any;

// JSON Schema types (pass through - not OTEL related)
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

// Mock OTLP exporters
export class OTLPTraceExporter {
  constructor(_config?: any) {}
}

export class Resource {
  attributes: Record<string, any> = {};
  static default() {
    return new Resource();
  }
  merge(_other: Resource) {
    return this;
  }
}

export class BatchSpanProcessor {
  constructor(_exporter: any) {}
}

export class ParentBasedSampler {
  constructor(_config: any) {}
}

export const SamplingDecision = { RECORD_AND_SAMPLE: 0 };

export class TraceIdRatioBasedSampler {
  constructor(_ratio: number) {}
}

export type Sampler = any;
export type SamplingResult = any;

export class NodeTracerProvider {
  constructor(_config?: any) {}
  addSpanProcessor(_processor: any) {}
  register() {}
}

export const SemanticResourceAttributes = {
  SERVICE_NAME: "service.name",
  SERVICE_VERSION: "service.version",
  SERVICE_INSTANCE_ID: "service.instance.id",
  CLOUD_PROVIDER: "cloud.provider",
  CLOUD_REGION: "cloud.region",
  DEPLOYMENT_ENVIRONMENT: "deployment.environment",
};

export class ExplicitBucketHistogramAggregation {
  constructor(_boundaries: number[]) {}
}

export class MeterProvider {
  constructor(_config?: any) {}
  getMeter(_name: string) {
    return {
      createHistogram: () => ({ record: () => {} }),
      createCounter: () => ({ add: () => {} }),
      createUpDownCounter: () => ({ add: () => {} }),
      createObservableGauge: () => {},
      createObservableCounter: () => {},
      createObservableUpDownCounter: () => {},
    };
  }
  addMetricReader(_reader: any) {}
}

export class PeriodicExportingMetricReader {
  constructor(_config: any) {}
}

export class View {
  constructor(_config: any) {}
}

export const logs = {
  info: () => {},
  warn: () => {},
  error: () => {},
};

export const SeverityNumber = { INFO: 9 };
export type Logger = any;

export class OTLPLogExporter {
  constructor(_config?: any) {}
}

export class OTLPMetricExporter {
  constructor(_config?: any) {}
}

export type OTLPExporterNodeConfigBase = any;

export const detectResourcesSync = () => new Resource();
export const envDetectorSync = () => new Resource();
export const hostDetectorSync = () => new Resource();
export const osDetectorSync = () => new Resource();
export const processDetector = () => new Resource();

export class BatchLogRecordProcessor {
  constructor(_exporter: any) {}
}

export class ConsoleLogRecordExporter {}

export class LoggerProvider {
  constructor(_config?: any) {}
}

export type BufferConfig = any;

export { MurmurHash3 as Murmurhash3 } from "./utils/hasher.ts";
