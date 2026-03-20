import {
  type Attributes,
  type ObservableGauge,
  type ObservableResult,
  type ObservableUpDownCounter,
  ValueType,
} from "../../../deps.ts";
import { meter } from "../metrics.ts";

const memoryUsage: ObservableGauge<Attributes> = meter
  .createObservableGauge("deno.memory_usage", {
    unit: "By",
    valueType: ValueType.DOUBLE,
    description: "Deno process memory usage in bytes.",
  });

const openResources: ObservableUpDownCounter<Attributes> = meter
  .createObservableUpDownCounter("deno.open_resources", {
    valueType: ValueType.DOUBLE,
    description: "Number of open resources of a particular type.",
  });

const gatherMemoryUsage = (x: ObservableResult<Attributes>) => {
  const usage = Deno.memoryUsage();
  x.observe(usage.rss, { "deno.memory.type": "rss" });
  x.observe(usage.heapTotal, { "deno.memory.type": "heap_total" });
  x.observe(usage.heapUsed, { "deno.memory.type": "heap_used" });
  x.observe(usage.external, { "deno.memory.type": "external" });
};

const gatherOpenResources = (x: ObservableResult<Attributes>) => {
  try {
    // deno-lint-ignore no-explicit-any
    const resources = (Deno as any).resources?.() as
      | Record<string, string>
      | undefined;
    if (!resources) return;
    const counts: Record<string, number> = {};
    for (const type of Object.values(resources)) {
      counts[type] = (counts[type] ?? 0) + 1;
    }
    for (const [type, count] of Object.entries(counts)) {
      x.observe(count, { "deno.resource.type": type });
    }
  } catch {
    // Deno.resources() may not be available in all environments
  }
};

memoryUsage.addCallback(gatherMemoryUsage);
openResources.addCallback(gatherOpenResources);

// Kept for backward compatibility — no longer needed but exported to avoid import errors
export class DenoRuntimeInstrumentation {}
