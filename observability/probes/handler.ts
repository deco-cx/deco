import type { MiddlewareHandler } from "$fresh/server.ts";
import { ValueType } from "../../deps.ts";
import { Median } from "../../utils/stat.ts";
import { meter } from "../otel/metrics.ts";
import { medianLatencyChecker } from "./medianLatency.ts";
import { memoryChecker } from "./memory.ts";
import { reqCountChecker } from "./reqCount.ts";
import { reqInflightChecker } from "./reqInflight.ts";
import { resourcesChecker } from "./resources.ts";
import { upTimeChecker } from "./uptime.ts";

export interface Metrics {
  uptime: number;
  requests: {
    inflight: number;
    count: number;
  };
  latency: {
    median: number;
  };
}

export interface LiveChecker {
  name: string;
  checker: (
    metrics: Metrics,
  ) => Promise<boolean> | boolean;
}

const DRY_RUN = Deno.env.get("PROBE_DRY_RUN") === "true";

const probe = meter.createCounter("probe_failed", {
  unit: "1",
  valueType: ValueType.INT,
});

export function getProbeThresholdAsNum(
  checkerName: string,
): number | undefined {
  const fromEnv = Deno.env.get(`PROBE_${checkerName}_THRESHOLD`);
  return fromEnv ? +fromEnv : undefined;
}

const livenessPath = "/_liveness";

const buildHandler = (...checkers: LiveChecker[]): MiddlewareHandler => {
  let reqCount = 0; // int should be fine as long as we don't have more than 2^53 requests for a single instance.
  let reqInflights = 0;
  const medianLatency = new Median();
  const metrics: Metrics = {
    get uptime() {
      return Deno.osUptime();
    },
    requests: {
      get count() {
        return reqCount;
      },
      get inflight() {
        return reqInflights;
      },
    },
    latency: {
      get median() {
        return medianLatency.get();
      },
    },
  };
  return async (
    req,
    ctx,
  ) => {
    if (
      ctx?.url?.pathname === livenessPath || req.url.endsWith(livenessPath)
    ) {
      const results = await Promise.all(
        checkers.map(async ({ checker, name }) => {
          try {
            return { check: await checker(metrics), name };
          } catch (_err) {
            console.error(`error while checking ${name}`);
            // does not consider as check false since it could be a bug
            return { check: true, name } as { check: boolean; name: string };
          }
        }),
      );
      const failedCheck = results.find(({ check }) => !check);
      const checks = JSON.stringify(results, null, 2);
      if (failedCheck) {
        const status = DRY_RUN ? 200 : 503;
        probe.add(1, {
          name: failedCheck.name,
        });
        return new Response(checks, { status });
      }
      return new Response(checks, { status: 200 });
    }
    reqCount++;
    reqInflights++;
    const start = performance.now();
    return ctx.next().finally(() => {
      const latency = performance.now() - start;
      medianLatency.add(latency);
      reqInflights--;
    });
  };
};

export const liveness = buildHandler(
  memoryChecker,
  upTimeChecker,
  reqCountChecker,
  medianLatencyChecker,
  reqInflightChecker,
  resourcesChecker,
);
