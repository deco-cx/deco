type Timing = { start: number; end?: number };

type TimingKey = string;

const slugify = (key: string) => key.replace(/\//g, ".");

export function createServerTimings() {
  const timings: Record<string, Timing> = {};
  const unique: Record<string, number> = {};

  const start = (_key: TimingKey) => {
    unique[_key] ??= 0;
    const count = unique[_key];
    const key = count === 0 ? _key : `${_key}-${count}`;
    timings[key] = { start: performance.now() };
    unique[_key]++;
    return () => end(key);
  };

  const end = (key: TimingKey) => {
    timings[key].end = performance.now();
  };

  const printTimings = () => {
    return Object.entries(timings)
      .map(([key, timing]) => {
        const duration = (timing.end! - timing.start).toFixed(0);
        return `${slugify(key)};dur=${duration}`;
      })
      .join(", ");
  };

  return {
    start,
    end,
    printTimings,
  };
}
