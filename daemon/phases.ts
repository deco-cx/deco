/**
 * Tracks daemon startup phases with millisecond timestamps and emits a single
 * `[phase] phase=<name> event=start|end ts=<ms> [duration_ms=<n>] [...]`
 * log line per transition. The same line format is used by the env app
 * container's startup script in deco-sites/admin, so a single grep across
 * pod logs reconstructs the full timeline.
 *
 * Phase data is also exposed through the daemon's /_ready endpoint so the
 * admin can record per-startup timings without parsing logs.
 */

interface PhaseRecord {
  startMs: number;
  endMs?: number;
  durationMs?: number;
  outcome?: string;
}

const phases: Record<string, PhaseRecord> = {};
const bootStartMs = Date.now();

const formatExtra = (extra?: Record<string, unknown>): string => {
  if (!extra) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}=${v}`);
  }
  return parts.length > 0 ? " " + parts.join(" ") : "";
};

export const phaseStart = (
  name: string,
  extra?: Record<string, unknown>,
): void => {
  const ts = Date.now();
  phases[name] = { startMs: ts };
  console.log(
    `[phase] phase=${name} event=start ts=${ts}${formatExtra(extra)}`,
  );
};

export const phaseEnd = (
  name: string,
  outcome: "ok" | "fail" | "skipped" = "ok",
  extra?: Record<string, unknown>,
): void => {
  const ts = Date.now();
  const rec = phases[name];
  if (!rec) {
    phases[name] = {
      startMs: ts,
      endMs: ts,
      durationMs: 0,
      outcome,
    };
    console.log(
      `[phase] phase=${name} event=end ts=${ts} duration_ms=0 outcome=${outcome}${
        formatExtra(extra)
      }`,
    );
    return;
  }
  rec.endMs = ts;
  rec.durationMs = ts - rec.startMs;
  rec.outcome = outcome;
  console.log(
    `[phase] phase=${name} event=end ts=${ts} duration_ms=${rec.durationMs} outcome=${outcome}${
      formatExtra(extra)
    }`,
  );
};

export interface PhaseSummary {
  bootStartMs: number;
  uptimeMs: number;
  phases: Record<
    string,
    { durationMs?: number; outcome?: string; pending?: boolean }
  >;
}

export const phaseSummary = (): PhaseSummary => {
  const out: PhaseSummary["phases"] = {};
  for (const [name, rec] of Object.entries(phases)) {
    out[name] = rec.endMs === undefined
      ? { pending: true }
      : { durationMs: rec.durationMs, outcome: rec.outcome };
  }
  return {
    bootStartMs,
    uptimeMs: Date.now() - bootStartMs,
    phases: out,
  };
};
