# Observability - Sistema de Observabilidade

O diretório `observability/` fornece um sistema completo de observabilidade para
aplicações deco, incluindo métricas, tracing distribuído, logging e probes de
health.

## Visão Geral

O sistema de observabilidade é baseado em **OpenTelemetry** e fornece
instrumentação automática para blocks, HTTP requests e operações do sistema.

## Arquitetura

```
observability/
├── mod.ts                  # Exportações principais
├── observe.ts              # Função principal de observação
├── http.ts                 # Instrumentação HTTP
├── otel/                   # Integração OpenTelemetry
│   ├── config.ts          # Configuração OTEL
│   ├── context.ts         # Contexto de tracing
│   ├── logger.ts          # Logger instrumentado
│   ├── metrics.ts         # Métricas
│   ├── samplers/          # Samplers de tracing
│   │   ├── debug.ts       # Sampler de debug
│   │   └── urlBased.ts    # Sampler baseado em URL
│   └── instrumentation/   # Instrumentação específica
│       └── deno-runtime.ts # Instrumentação Deno
└── probes/                # Health probes
    ├── handler.ts         # Handler de probes
    ├── medianLatency.ts   # Latência mediana
    ├── memory.ts          # Uso de memória
    ├── reqCount.ts        # Contagem de requisições
    ├── reqInflight.ts     # Requisições em andamento
    └── uptime.ts          # Tempo de atividade
```

## Função Principal (`observe.ts`)

```typescript
export const observe = async <T>(
  fn: () => Promise<T> | T,
  options: ObserveOptions = {},
): Promise<T> => {
  const {
    name = "unknown",
    attributes = {},
    metrics = true,
    tracing = true,
    logger = console,
  } = options;

  const startTime = performance.now();
  const span = tracer.startSpan(name, { attributes });

  try {
    const result = await fn();

    // Record success metrics
    if (metrics) {
      meter.createCounter(`${name}_success_total`).add(1, attributes);
      meter.createHistogram(`${name}_duration_ms`).record(
        performance.now() - startTime,
        attributes,
      );
    }

    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    // Record error metrics
    if (metrics) {
      meter.createCounter(`${name}_error_total`).add(1, {
        ...attributes,
        error: error.name || "unknown",
      });
    }

    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message,
    });

    throw error;
  } finally {
    span.end();
  }
};

export interface ObserveOptions {
  name?: string;
  attributes?: Record<string, string | number>;
  metrics?: boolean;
  tracing?: boolean;
  logger?: Console;
}
```

## OpenTelemetry Integration (`otel/`)

### Config (`config.ts`)

```typescript
export const tracer = trace.getTracer("deco", process.env.DECO_VERSION);
export const meter = metrics.getMeter("deco", process.env.DECO_VERSION);
export const logger = logs.getLogger("deco", process.env.DECO_VERSION);

// Initialize OpenTelemetry
const init = () => {
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "deco",
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.DECO_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV ||
      "development",
  });

  const sdk = new NodeSDK({
    resource,
    traceExporter: new ConsoleSpanExporter(),
    metricExporter: new ConsoleMetricExporter(),
    logExporter: new ConsoleLogExporter(),
    instrumentations: [
      new HttpInstrumentation(),
      new FsInstrumentation(),
      new DenoRuntimeInstrumentation(),
    ],
  });

  sdk.start();
};

init();
```

### Context (`context.ts`)

```typescript
export const REQUEST_CONTEXT_KEY = createContextKey<Request>("request");
export const STATE_CONTEXT_KEY = createContextKey<any>("state");
export const SPAN_CONTEXT_KEY = createContextKey<Span>("span");

export const getRequestFromContext = (): Request | undefined => {
  return context.active().getValue(REQUEST_CONTEXT_KEY);
};

export const getStateFromContext = (): any => {
  return context.active().getValue(STATE_CONTEXT_KEY);
};

export const withRequestContext = <T>(
  request: Request,
  fn: () => T,
): T => {
  return context.with(
    context.active().setValue(REQUEST_CONTEXT_KEY, request),
    fn,
  );
};
```

### Metrics (`metrics.ts`)

```typescript
export const meter = metrics.getMeter("deco");

// Common metrics
export const requestCounter = meter.createCounter("http_requests_total", {
  description: "Total number of HTTP requests",
});

export const requestDuration = meter.createHistogram(
  "http_request_duration_ms",
  {
    description: "HTTP request duration in milliseconds",
    unit: "ms",
  },
);

export const blockExecutionCounter = meter.createCounter(
  "block_executions_total",
  {
    description: "Total number of block executions",
  },
);

export const blockExecutionDuration = meter.createHistogram(
  "block_execution_duration_ms",
  {
    description: "Block execution duration in milliseconds",
    unit: "ms",
  },
);

// Environment-specific metrics
export const OTEL_ENABLE_EXTRA_METRICS =
  Deno.env.get("OTEL_ENABLE_EXTRA_METRICS") === "true";

if (OTEL_ENABLE_EXTRA_METRICS) {
  // Memory metrics
  const memoryUsage = meter.createObservableGauge("memory_usage_bytes", {
    description: "Memory usage in bytes",
  });

  memoryUsage.addCallback((result) => {
    const memInfo = Deno.memoryUsage();
    result.observe(memInfo.rss, { type: "rss" });
    result.observe(memInfo.heapUsed, { type: "heap_used" });
    result.observe(memInfo.heapTotal, { type: "heap_total" });
  });
}
```

### Samplers (`samplers/`)

#### Debug Sampler (`debug.ts`)

```typescript
export class DebugSampler implements Sampler {
  private debugParam: string;

  constructor(debugParam = "debug") {
    this.debugParam = debugParam;
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
    spanKind: SpanKind,
    attributes: SpanAttributes,
  ): SamplingResult {
    const request = getRequestFromContext();

    if (request) {
      const url = new URL(request.url);
      if (url.searchParams.has(this.debugParam)) {
        return { decision: SamplingDecision.RECORD_AND_SAMPLED };
      }
    }

    return { decision: SamplingDecision.NOT_RECORD };
  }
}
```

#### URL-Based Sampler (`urlBased.ts`)

```typescript
export class UrlBasedSampler implements Sampler {
  private sampleRates: Map<string, number>;

  constructor(sampleRates: Record<string, number> = {}) {
    this.sampleRates = new Map(Object.entries(sampleRates));
  }

  shouldSample(
    context: Context,
    traceId: string,
    spanName: string,
  ): SamplingResult {
    const request = getRequestFromContext();

    if (request) {
      const url = new URL(request.url);
      const pathname = url.pathname;

      for (const [pattern, rate] of this.sampleRates) {
        if (pathname.includes(pattern)) {
          return Math.random() < rate
            ? { decision: SamplingDecision.RECORD_AND_SAMPLED }
            : { decision: SamplingDecision.NOT_RECORD };
        }
      }
    }

    return { decision: SamplingDecision.NOT_RECORD };
  }
}
```

## HTTP Instrumentation (`http.ts`)

```typescript
export const startObserve = (request: Request): ObserveContext => {
  const startTime = performance.now();
  const url = new URL(request.url);

  const attributes = {
    "http.method": request.method,
    "http.url": request.url,
    "http.scheme": url.protocol.slice(0, -1),
    "http.host": url.host,
    "http.target": url.pathname + url.search,
    "user_agent.original": request.headers.get("user-agent") || "",
  };

  const span = tracer.startSpan(`HTTP ${request.method} ${url.pathname}`, {
    kind: SpanKind.SERVER,
    attributes,
  });

  requestCounter.add(1, attributes);

  return {
    span,
    startTime,
    attributes,
    finish: (response: Response) => {
      const duration = performance.now() - startTime;

      const responseAttributes = {
        ...attributes,
        "http.status_code": response.status,
        "http.response.size": response.headers.get("content-length") || "0",
      };

      requestDuration.record(duration, responseAttributes);

      span.setAttributes(responseAttributes);
      span.setStatus(
        response.status >= 400
          ? { code: SpanStatusCode.ERROR }
          : { code: SpanStatusCode.OK },
      );

      span.end();
    },
  };
};

export interface ObserveContext {
  span: Span;
  startTime: number;
  attributes: Record<string, string | number>;
  finish: (response: Response) => void;
}
```

## Health Probes (`probes/`)

### Handler (`handler.ts`)

```typescript
export interface HealthProbe {
  name: string;
  check(): Promise<ProbeResult>;
}

export interface ProbeResult {
  healthy: boolean;
  message?: string;
  data?: any;
}

export const createHealthHandler = (probes: HealthProbe[]): Handler => {
  return async (request: Request): Promise<Response> => {
    const results = await Promise.allSettled(
      probes.map(async (probe) => ({
        name: probe.name,
        ...(await probe.check()),
      })),
    );

    const probeResults = results.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      } else {
        return {
          name: probes[index].name,
          healthy: false,
          message: result.reason.message || "Unknown error",
        };
      }
    });

    const allHealthy = probeResults.every((result) => result.healthy);
    const status = allHealthy ? 200 : 503;

    return new Response(
      JSON.stringify({
        healthy: allHealthy,
        probes: probeResults,
        timestamp: new Date().toISOString(),
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      },
    );
  };
};
```

### Memory Probe (`memory.ts`)

```typescript
export const memoryProbe: HealthProbe = {
  name: "memory",
  async check(): Promise<ProbeResult> {
    const memInfo = Deno.memoryUsage();
    const usedMemoryPercent = (memInfo.heapUsed / memInfo.heapTotal) * 100;

    const threshold = 90; // 90% threshold
    const healthy = usedMemoryPercent < threshold;

    return {
      healthy,
      message: healthy ? "Memory usage normal" : "Memory usage high",
      data: {
        usedPercent: usedMemoryPercent.toFixed(2),
        heapUsed: memInfo.heapUsed,
        heapTotal: memInfo.heapTotal,
        rss: memInfo.rss,
      },
    };
  },
};
```

### Request Count Probe (`reqCount.ts`)

```typescript
class RequestCountProbe implements HealthProbe {
  name = "request_count";
  private counter = 0;
  private resetInterval: number;

  constructor(resetInterval = 60000) { // 1 minute
    this.resetInterval = resetInterval;
    setInterval(() => this.reset(), this.resetInterval);
  }

  increment() {
    this.counter++;
  }

  reset() {
    this.counter = 0;
  }

  async check(): Promise<ProbeResult> {
    return {
      healthy: true,
      data: {
        count: this.counter,
        intervalMs: this.resetInterval,
      },
    };
  }
}

export const reqCountProbe = new RequestCountProbe();
```

### Uptime Probe (`uptime.ts`)

```typescript
export const uptimeProbe: HealthProbe = {
  name: "uptime",
  async check(): Promise<ProbeResult> {
    const uptimeSeconds = performance.now() / 1000;

    return {
      healthy: true,
      data: {
        uptimeSeconds: uptimeSeconds.toFixed(2),
        startTime: new Date(Date.now() - uptimeSeconds * 1000).toISOString(),
      },
    };
  },
};
```

## Exemplo de Uso

```typescript
// Instrumentando uma função
const result = await observe(async () => {
  return await processData(data);
}, {
  name: "process_data",
  attributes: {
    dataType: "user",
    source: "api",
  },
});

// Criando health check
const healthProbes = [
  memoryProbe,
  uptimeProbe,
  reqCountProbe,
];

const healthHandler = createHealthHandler(healthProbes);

// Configurando samplers
const sampler = new UrlBasedSampler({
  "/api/": 0.1, // 10% das requisições API
  "/health": 0.01, // 1% das requisições de health
  "/debug": 1.0, // 100% das requisições de debug
});

// Instrumentação HTTP automática
app.use(async (ctx, next) => {
  const observeCtx = startObserve(ctx.req.raw);
  try {
    await next();
  } finally {
    observeCtx.finish(ctx.res);
  }
});
```

O sistema de observabilidade fornece visibilidade completa sobre o comportamento
da aplicação, permitindo monitoramento, debugging e otimização de performance.
