/**
 * OpenTelemetry Logger Implementation
 *
 * This file is only loaded dynamically when OpenTelemetry is being initialized.
 * It uses CommonJS-dependent packages that are incompatible with Vite SSR.
 */

import * as log from "@std/log";
import { type LevelName, LogLevels } from "@std/log/levels";
import type { LogRecord } from "@std/log/logger";

import type { Attributes } from "@opentelemetry/api";
import {
  BatchLogRecordProcessor,
  type BufferConfig,
  ConsoleLogRecordExporter,
  LoggerProvider,
  type Logger,
} from "@opentelemetry/sdk-logs";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import type { OTLPExporterNodeConfigBase } from "@opentelemetry/otlp-exporter-base";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  detectResourcesSync,
  envDetectorSync,
  hostDetectorSync,
  osDetectorSync,
  processDetector,
  Resource,
} from "@opentelemetry/resources";

const UNSPECIFIED_SEVERITY_TEXT = "";

// https://github.com/open-telemetry/opentelemetry-specification/blob/fc8289b8879f3a37e1eba5b4e445c94e74b20359/specification/logs/data-model.md#displaying-severity
const OTEL_SEVERITY_NAME_MAP: Record<number, string> = {
  0: UNSPECIFIED_SEVERITY_TEXT,
  1: "TRACE",
  2: "TRACE2",
  3: "TRACE3",
  4: "TRACE4",
  5: "DEBUG",
  6: "DEBUG2",
  7: "DEBUG3",
  8: "DEBUG4",
  9: "INFO",
  10: "INFO2",
  11: "INFO3",
  12: "INFO4",
  13: "WARN",
  14: "WARN2",
  15: "WARN3",
  16: "WARN4",
  17: "ERROR",
  18: "ERROR2",
  19: "ERROR3",
  20: "ERROR4",
  21: "FATAL",
  22: "FATAL2",
  23: "FATAL3",
  24: "FATAL4",
};

interface HandlerOptions extends log.BaseHandlerOptions {
  exporterProtocol?: "http" | "console";
  httpExporterOptions?: OTLPExporterNodeConfigBase;
  processorConfig?: BufferConfig;
  resourceAttributes?: Attributes;
  detectResources?: boolean;
}

export class OpenTelemetryHandler extends log.BaseHandler {
  protected _logger: Logger | undefined;
  protected _processor: BatchLogRecordProcessor | undefined;

  #unloadCallback = (() => {
    this.destroy();
  }).bind(this);

  constructor(levelName: LevelName, options: HandlerOptions = {}) {
    super(levelName, options);

    const detectedResource = detectResourcesSync({
      detectors:
        options.detectResources === false ? [] : [
          envDetectorSync,
          hostDetectorSync,
          osDetectorSync,
          processDetector,
        ],
    });

    const exporter = options.exporterProtocol === "console"
      ? new ConsoleLogRecordExporter()
      : new OTLPLogExporter(options.httpExporterOptions);

    const processor = new BatchLogRecordProcessor(
      // @ts-ignore: no idea why this is failing, but it should work
      exporter,
      options.processorConfig,
    );
    this._processor = processor;

    const loggerProvider = new LoggerProvider({
      resource: detectedResource.merge(
        new Resource({ ...options.resourceAttributes }),
      ),
    });
    loggerProvider.addLogRecordProcessor(processor);
    logs.setGlobalLoggerProvider(loggerProvider);
    const logger = logs.getLogger("deno-logger");
    this._logger = logger;
  }

  override setup() {
    addEventListener("unload", this.#unloadCallback);
  }

  private toOtelSeverityNumber(level: number): SeverityNumber {
    switch (level) {
      case LogLevels.DEBUG:
        return SeverityNumber.DEBUG;
      case LogLevels.INFO:
        return SeverityNumber.INFO;
      case LogLevels.WARN:
        return SeverityNumber.WARN;
      case LogLevels.ERROR:
        return SeverityNumber.ERROR;
      case LogLevels.CRITICAL:
        return SeverityNumber.FATAL;
      default:
        return SeverityNumber.UNSPECIFIED;
    }
  }

  override handle(logRecord: LogRecord) {
    if (this.level > logRecord.level) return;
    const firstArg = logRecord?.args?.[0];

    const otelSeverityNumber = this.toOtelSeverityNumber(logRecord.level);

    this._logger?.emit({
      severityNumber: otelSeverityNumber,
      severityText: OTEL_SEVERITY_NAME_MAP[otelSeverityNumber] ??
        UNSPECIFIED_SEVERITY_TEXT,
      body: logRecord.msg,
      attributes: {
        ...typeof firstArg === "object" ? firstArg : {},
        loggerName: logRecord.loggerName,
      },
    });
  }

  log(_msg: string) {}
  flush() {}

  override destroy() {
    this.flush();
    this._processor?.shutdown();
    removeEventListener("unload", this.#unloadCallback);
  }
}
