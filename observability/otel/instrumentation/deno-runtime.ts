/**
 * Heavily inspired from unlicense code: https://github.com/cloudydeno/deno-observability/blob/main/instrumentation/deno-runtime.ts
 */
import {
  Attributes,
  BatchObservableResult,
  InstrumentationBase,
  InstrumentationConfig,
  ObservableCounter,
  ObservableGauge,
  ObservableResult,
  ObservableUpDownCounter,
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

  private gatherOpenResources = (x: ObservableResult<Attributes>) => {
    for (
      const entry of Object
        .values(Deno.resources())
        .reduce<Map<string, number>>(
          (acc, x) => (acc.set(x, 1 + (acc.get(x) ?? 0)), acc),
          new Map(),
        )
    ) {
      x.observe(entry[1], { "deno.resource.type": entry[0] });
    }
  };

  private gatherMemoryUsage = (x: ObservableResult<Attributes>) => {
    const usage = Deno.memoryUsage();
    x.observe(usage.rss, { "deno.memory.type": "rss" });
    x.observe(usage.heapTotal, { "deno.memory.type": "heap_total" });
    x.observe(usage.heapUsed, { "deno.memory.type": "heap_used" });
    x.observe(usage.external, { "deno.memory.type": "external" });
  };

  private gatherOps = (x: BatchObservableResult<Attributes>) => {
    for (const [op, data] of Object.entries(Deno.metrics().ops)) {
      if (data.opsDispatched == 0) continue;
      x.observe(this.metrics.dispatchedCtr, data.opsDispatched, {
        "deno.op": op,
      });
      x.observe(
        this.metrics.inflightCtr,
        data.opsDispatched - data.opsCompleted,
        { "deno.op": op },
      );
    }
  };

  enable() {
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

    this.metrics.openResources.addCallback(this.gatherOpenResources);
    this.metrics.memoryUsage.addCallback(this.gatherMemoryUsage);
    this.meter.addBatchObservableCallback(this.gatherOps, [
      this.metrics.dispatchedCtr,
      this.metrics.inflightCtr,
    ]);
  }

  disable() {
    this.metrics.openResources.removeCallback(this.gatherOpenResources);
    this.metrics.memoryUsage.removeCallback(this.gatherMemoryUsage);
    this.meter.removeBatchObservableCallback(this.gatherOps, [
      this.metrics.dispatchedCtr,
      this.metrics.inflightCtr,
    ]);
  }
}
