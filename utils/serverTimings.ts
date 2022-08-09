type Timing = { start: number; end?: number };

type TimingKey = "fetch-page-data" | "render"

export function createServerTiming() {
  const timings: Record<string, Timing> = {};

  const start = (key: TimingKey) => {
    timings[key] = { start: Date.now() };
  };

  const end = (key: TimingKey) => {
    timings[key].end = Date.now();
  };

  const printTimings = () => {
    return Object.entries(timings)
      .map(([key, timing]) => {
        return `${key};dur=${timing.end - timing.start}`;
      })
      .join(", ");
  };

  return {
    start,
    end,
    printTimings,
  };
}
