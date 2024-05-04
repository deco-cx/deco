import { blue, bold, cyan, gray, green, red, yellow } from "std/fmt/colors.ts";
import { Timing } from "./timings.ts";

export const formatOutgoingFetch = (
  request: Request,
  response: Response,
  duration: number,
) => {
  const xcache = response.headers.get("x-cache") ?? "BYPASS";
  const durationColor = duration < 300 ? green : duration < 700 ? yellow : red;
  const durationStr = duration > 1e3
    ? `${(duration / 1e3).toFixed(2)}s`
    : `${duration.toFixed(0)}ms`;

  return ` -> ${xcache.padEnd(6)} ${durationColor(durationStr)} ${
    bold(request.method)
  } | ${gray(request.url)}`;
};

interface LogOptions {
  status: number;
  begin: number;
  url: URL;
  timings?: readonly Timing[];
}

const formatStatus = (status: number) =>
  (status < 300 ? green : status < 400 ? blue : status < 500 ? yellow : red)(
    `${status}`,
  );

const formatLatency = (latency: number) => `${latency.toFixed(0)}ms`.padEnd(6);

const progress = (
  start: number,
  end: number,
  totalStart: number,
  totalEnd: number,
) => {
  const length = 20;
  const duration = totalEnd - totalStart;
  const charStart = Math.ceil(length * (start - totalStart) / duration);
  const charEnd = Math.ceil(length * (end - totalStart) / duration);

  const bar: string[] = [];
  for (let it = 0; it < length; it++) {
    if (it < charStart) bar.push(" ");
    else if (it < charEnd) bar.push("=");
    else bar.push(" ");
  }

  return `[${bar.join("")}]`;
};

export const formatLog = (opts: LogOptions) => {
  const end = performance.now();
  const s = formatStatus(opts.status);
  const l = formatLatency(end - opts.begin);
  const p = cyan(opts.url.pathname);

  const summary = `[${s}] ${l} ${p}`;

  if (opts.timings === undefined) {
    return summary;
  }

  const totalServerTiming = {
    start: opts.begin,
    end,
    name: opts.url.pathname,
    desc: opts.status.toString(),
  };

  const timings = [totalServerTiming, ...opts.timings]
    .map((t) => {
      if (!t.end) return;

      const duration = t.end - t.start;
      const l = formatLatency(duration);
      const n = gray(t.name);
      const d = (t.desc?.toUpperCase() ?? "").padEnd(6);

      return `${progress(t.start, t.end, opts.begin, end)} ${l} ${d} ${n} `;
    })
    .filter(Boolean)
    .join("\n");

  return `${summary}\n${timings}`;
};
