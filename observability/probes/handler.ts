export interface Metrics {
  uptime: number;
  requestCount: number;
  latency: {
    avg: number;
  };
}

import type { MiddlewareHandler } from "$fresh/server.ts";
import { ValueType } from "deco/deps.ts";
import { meter } from "../otel/metrics.ts";
import { avgLatencyChecker } from "./avgLatency.ts";
import { memoryChecker } from "./memory.ts";
import { reqCountChecker } from "./reqCount.ts";
import { upTimeChecker } from "./uptime.ts";

export interface LiveChecker {
  name: string;
  checker: (
    metrics: Metrics,
  ) => Promise<boolean> | boolean;
}

const envObj = Deno.env.toObject();

const DRY_RUN = envObj.PROBE_DRY_RUN === "true";

const probe = meter.createCounter("probe_failed", {
  unit: "1",
  valueType: ValueType.INT,
});

export const getProbeThresholdAsNum = (
  checkerName: string,
): number | undefined => {
  const fromEnv = envObj[`PROBE_${checkerName}_THRESHOLD`];
  return fromEnv ? +fromEnv : undefined;
};

const livenessPath = "/_liveness";

const buildHandler = (...checkers: LiveChecker[]): MiddlewareHandler => {
  let reqCount = 0; // int should be fine as long as we don't have more than 2^53 requests for a single instance.
  let avgLatency = 0;
  const metrics: Metrics = {
    get uptime() {
      return Deno.osUptime();
    },
    get requestCount() {
      return reqCount;
    },
    latency: {
      get avg() {
        return avgLatency;
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
          return { check: await checker(metrics), name };
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
    const start = performance.now();
    return ctx.next().finally(() => {
      avgLatency = (avgLatency * (reqCount - 1) + performance.now() - start) /
        reqCount;
    });
  };
};

export const liveness = buildHandler(
  memoryChecker,
  upTimeChecker,
  reqCountChecker,
  avgLatencyChecker,
);
