import type { MiddlewareHandler } from "$fresh/server.ts";
import { ValueType } from "../../deps.ts";
import { meter } from "../otel/metrics.ts";
import { medianLatencyChecker } from "./medianLatency.ts";
import { memoryChecker } from "./memory.ts";
import { reqCountChecker } from "./reqCount.ts";
import { reqInflightChecker } from "./reqInflight.ts";
import { resourcesChecker } from "./resources.ts";
import { uptimeChecker } from "./uptime.ts";

export interface Metrics {
  uptime: number;
  requests: {
    inflight: number;
    count: number;
  };
  latency: {
    median: number;
  };
  mem: Deno.MemoryUsage;
  sys: Deno.SystemMemoryInfo;
  resources: Deno.ResourceMap;
}

export interface LiveChecker<TValue = number> {
  name: string;
  get: () => TValue;
  observe?: (
    req: Request,
  ) => { end: (response?: Response) => void } | void;
  print: (val: TValue) => unknown;
  check: (val: TValue) => Promise<boolean> | boolean;
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

const buildHandler = (
  // deno-lint-ignore no-explicit-any
  ...checkers: LiveChecker<any>[]
): MiddlewareHandler => {
  return async (
    req,
    ctx,
  ) => {
    if (
      ctx?.url?.pathname === livenessPath || req.url.endsWith(livenessPath)
    ) {
      const results = await Promise.all(
        checkers.map(async ({ check, name, get, print }) => {
          try {
            const val = get();
            return { check: await check(val), name, probe: print(val) };
          } catch (_err) {
            console.error(`error while checking ${name}`);
            // does not consider as check false since it could be a bug
            return { check: true, name, probe: undefined } as {
              check: boolean;
              name: string;
            };
          }
        }),
      );
      const failedCheck = results.find(({ check }) => !check);
      const checks = JSON.stringify({ checks: results }, null, 2);
      if (failedCheck) {
        const status = DRY_RUN ? 200 : 503;
        probe.add(1, {
          name: failedCheck.name,
        });
        return new Response(checks, { status });
      }
      return new Response(checks, { status: 200 });
    }

    const end = checkers.map(({ observe }) => {
      return observe?.(req);
    });
    let response: Response | undefined = undefined;
    return ctx.next().then((resp) => response = resp).finally(() => {
      end.forEach((e) => e?.end(response));
    });
  };
};

export const liveness = buildHandler(
  memoryChecker,
  uptimeChecker,
  reqCountChecker,
  medianLatencyChecker,
  reqInflightChecker,
  resourcesChecker,
);
