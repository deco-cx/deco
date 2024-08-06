// deno-lint-ignore-file no-explicit-any
import { ValueType } from "../../deps.ts";
import { logger } from "../../observability/otel/config.ts";
import { meter } from "../../observability/otel/metrics.ts";
import { medianLatencyChecker } from "../../observability/probes/medianLatency.ts";
import { memoryChecker } from "../../observability/probes/memory.ts";
import { reqCountChecker } from "../../observability/probes/reqCount.ts";
import { reqInflightChecker } from "../../observability/probes/reqInflight.ts";
import { resourcesChecker } from "../../observability/probes/resources.ts";
import { uptimeChecker } from "../../observability/probes/uptime.ts";
import type { DecoMiddleware } from "../middleware.ts";

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
  check: (val: TValue) => boolean;
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

const livenessPath = "/deco/_liveness";

const buildHandler = (
  ...checkers: LiveChecker<any>[]
): DecoMiddleware<any> => {
  const runChecks = () => {
    return checkers.map(({ check, name, get, print }) => {
      try {
        const val = get();
        return { check: check(val), name, probe: print(val) };
      } catch (_err) {
        console.error(`error while checking ${name}`);
        // does not consider as check false since it could be a bug
        return { check: true, name, probe: undefined } as {
          check: boolean;
          name: string;
        };
      }
    });
  };
  try {
    if (Deno.build.os !== "windows") {
      Deno.addSignalListener("SIGTERM", () => {
        const checks = runChecks();
        console.log(checks);
        self.close();
      });
    }
  } catch (err) {
    console.error(`could not add signal handler ${err}`);
  }
  return async (
    ctx,
    next,
  ) => {
    if (
      ctx?.req.path === livenessPath ||
      ctx.req.path.endsWith(livenessPath)
    ) {
      const results = runChecks();

      const failedCheck = results.find(({ check }) => !check);
      const checks = JSON.stringify({ checks: results }, null, 2);
      if (failedCheck) {
        const status = DRY_RUN ? 200 : 503;
        probe.add(1, {
          name: failedCheck.name,
        });
        const msg = `liveness probe failed: ${failedCheck.name}`;
        logger.error(msg, {
          probe_failed: true,
          failed_check: failedCheck.name,
          dry_run: DRY_RUN,
          probe: checks,
        });
        console.error(msg, checks);
        return ctx.res = new Response(checks, { status });
      }
      return ctx.res = new Response(checks, { status: 200 });
    }

    const end = checkers.map(({ observe }) => {
      return observe?.(ctx.req.raw);
    });
    let response: Response | undefined = undefined;
    return await next().then(() => response = ctx.res).finally(() => {
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
