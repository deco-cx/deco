type Timing = { start: number; end?: number };

export function createServerTiming() {
  const timings: Record<string, Timing> = {};
  const start = (key: string) => {
    timings[key] = { start: Date.now() };
  };
  const end = (key: string) => {
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
