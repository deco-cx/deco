// Durable workflow support - use shim if @deco/durable not available
// This allows sites without workflow needs to run without the durable dependency
export * from "./durable-shim.ts";

// Cross-runtime crypto, encoding, http utilities
// Use native Web Crypto API which works in Deno, Node.js, and Bun
export const crypto = globalThis.crypto;

// Hex encoding/decoding - cross-runtime implementation
export function encodeHex(data: Uint8Array | ArrayBuffer): string {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function decodeHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

// Cookie utilities - cross-runtime implementation
export interface Cookie {
  name: string;
  value: string;
  expires?: Date;
  maxAge?: number;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

export function getCookies(headers: Headers): Record<string, string> {
  const cookie = headers.get("Cookie");
  if (!cookie) return {};
  const result: Record<string, string> = {};
  for (const pair of cookie.split(";")) {
    const [key, ...values] = pair.split("=");
    if (key) {
      result[key.trim()] = values.join("=").trim();
    }
  }
  return result;
}

export function getSetCookies(headers: Headers): Cookie[] {
  const cookies: Cookie[] = [];
  headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      const parts = value.split(";").map((p) => p.trim());
      const [nameValue, ...attrs] = parts;
      const [name, ...vals] = nameValue.split("=");
      const cookie: Cookie = { name, value: vals.join("=") };
      for (const attr of attrs) {
        const [attrName, attrValue] = attr.split("=");
        const lowerAttr = attrName.toLowerCase();
        if (lowerAttr === "expires") cookie.expires = new Date(attrValue);
        else if (lowerAttr === "max-age") cookie.maxAge = parseInt(attrValue);
        else if (lowerAttr === "domain") cookie.domain = attrValue;
        else if (lowerAttr === "path") cookie.path = attrValue;
        else if (lowerAttr === "secure") cookie.secure = true;
        else if (lowerAttr === "httponly") cookie.httpOnly = true;
        else if (lowerAttr === "samesite") {
          cookie.sameSite = attrValue as "Strict" | "Lax" | "None";
        }
      }
      cookies.push(cookie);
    }
  });
  return cookies;
}

export function setCookie(headers: Headers, cookie: Cookie): void {
  let str = `${cookie.name}=${cookie.value}`;
  if (cookie.expires) str += `; Expires=${cookie.expires.toUTCString()}`;
  if (cookie.maxAge !== undefined) str += `; Max-Age=${cookie.maxAge}`;
  if (cookie.domain) str += `; Domain=${cookie.domain}`;
  if (cookie.path) str += `; Path=${cookie.path}`;
  if (cookie.secure) str += "; Secure";
  if (cookie.httpOnly) str += "; HttpOnly";
  if (cookie.sameSite) str += `; SameSite=${cookie.sameSite}`;
  headers.append("Set-Cookie", str);
}

// Inspect VSCode - stub implementation for non-Deno runtimes
// These are dev-only features for VSCode integration
export const DomInspector = () => null;
export const DomInspectorActivators = { none: "none" as const };
export const inspectHandler = () => new Response(null, { status: 404 });
// OpenTelemetry - using standard npm imports (works with both Deno and Node.js/Bun)
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
export { FetchInstrumentation } from "@opentelemetry/instrumentation-fetch";
export {
  InstrumentationBase,
  isWrapped as instrumentationIsWrapped,
  registerInstrumentations,
} from "@opentelemetry/instrumentation";
export type { InstrumentationConfig } from "@opentelemetry/instrumentation";
export type {
  JSONSchema7,
  JSONSchema7Definition,
  JSONSchema7Type,
  JSONSchema7TypeName,
} from "@types/json-schema";
export type {
  DeepPartial,
  Diff,
  Intersection,
  OptionalKeys,
  Overwrite,
  RequiredKeys,
  UnionToIntersection,
} from "utility-types";
export * as weakcache from "weak-lru-cache";

// Handler type compatible with Deno.ServeHandler and Node.js/Bun
export type Handler = (
  request: Request,
  info?: { remoteAddr?: { hostname: string; port: number } },
) => Response | Promise<Response>;

export { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
export { Resource } from "@opentelemetry/resources";
export {
  BatchSpanProcessor,
  ParentBasedSampler,
  SamplingDecision,
  TraceIdRatioBasedSampler,
} from "@opentelemetry/sdk-trace-base";

export type {
  Sampler,
  SamplingResult,
} from "@opentelemetry/sdk-trace-base";
export { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
export {
  SemanticResourceAttributes,
} from "@opentelemetry/semantic-conventions";

export {
  ExplicitBucketHistogramAggregation,
  MeterProvider,
  PeriodicExportingMetricReader,
  View,
} from "@opentelemetry/sdk-metrics";

export { logs, SeverityNumber } from "@opentelemetry/api-logs";
export type { Logger } from "@opentelemetry/api-logs";
export { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
export { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
export type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
export {
  detectResourcesSync,
  envDetectorSync,
  hostDetectorSync,
  osDetectorSync,
  processDetector,
} from "@opentelemetry/resources";
export {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
export type { BufferConfig } from "@opentelemetry/sdk-logs";
export { MurmurHash3 as Murmurhash3 } from "./utils/hasher.ts";
