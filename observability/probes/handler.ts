export interface LiveChecker<TValue = number> {
  name: string;
  get: () => TValue;
  observe?: (
    req: Request,
  ) => { end: (response?: Response) => void } | void;
  print: (val: TValue) => unknown;
  check: (val: TValue) => boolean;
}

export function getProbeThresholdAsNum(
  checkerName: string,
): number | undefined {
  const fromEnv = Deno.env.get(`PROBE_${checkerName}_THRESHOLD`);
  return fromEnv ? +fromEnv : undefined;
}
