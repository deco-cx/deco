/**
 * Heavily inspired from unlicense code: https://github.com/cloudydeno/deno-observability/blob/main/instrumentation/deno-runtime.ts
 */
import {
  type Attributes,
  InstrumentationBase,
  type InstrumentationConfig,
  type ObservableCounter,
  type ObservableGauge,
  type ObservableResult,
  type ObservableUpDownCounter,
  ValueType,
} from "../../../deps.ts";

export class DenoRuntimeInstrumentation extends InstrumentationBase {
  readonly component: string = "deno-runtime";
  moduleName = this.component;

  constructor(_config?: InstrumentationConfig) {
    super("deno-runtime", "0.1.0", { enabled: false });
  }

  metrics!: {
    openResources: ObservableUpDownCounter<Attributes>;
    memoryUsage: ObservableGauge<Attributes>;
    dispatchedCtr: ObservableCounter<Attributes>;
    inflightCtr: ObservableUpDownCounter<Attributes>;
  };

  protected init() {}

  private gatherMemoryUsage = (x: ObservableResult<Attributes>) => {
    const usage = Deno.memoryUsage();
    x.observe(usage.rss, { "deno.memory.type": "rss" });
    x.observe(usage.heapTotal, { "deno.memory.type": "heap_total" });
    x.observe(usage.heapUsed, { "deno.memory.type": "heap_used" });
    x.observe(usage.external, { "deno.memory.type": "external" });
  };

  override enable() {
    this.metrics ??= {
      openResources: this.meter
        .createObservableUpDownCounter("deno.open_resources", {
          valueType: ValueType.INT,
          description: "Number of open resources of a particular type.",
        }),
      memoryUsage: this.meter
        .createObservableGauge("deno.memory_usage", {
          valueType: ValueType.INT,
        }),
      dispatchedCtr: this.meter
        .createObservableCounter("deno.ops_dispatched", {
          valueType: ValueType.INT,
          description: "Total number of Deno op invocations.",
        }),
      inflightCtr: this.meter
        .createObservableUpDownCounter("deno.ops_inflight", {
          valueType: ValueType.INT,
          description: "Number of currently-inflight Deno ops.",
        }),
    };

    this.metrics.memoryUsage.addCallback(this.gatherMemoryUsage);
  }

  override disable() {
    this.metrics.memoryUsage.removeCallback(this.gatherMemoryUsage);
  }
}
