type Timing = { start: number; end?: number; desc?: string };

type TimingKey = string;

const slugify = (key: string) => key.replace(/\//g, ".");

export function createServerTimings() {
  const timings: Record<string, Timing> = {};
  const unique: Record<string, number> = {};

  const start = (_key: TimingKey, desc?: string) => {
    unique[_key] ??= 0;
    const count = unique[_key];
    const key = count === 0 ? _key : `${_key}-${count}`;
    timings[key] = { start: performance.now(), desc };
    unique[_key]++;
    return () => end(key);
  };

  const end = (key: TimingKey) => {
    timings[key].end = performance.now();
  };

  const printTimings = () => {
    return Object.entries(timings)
      .map(([key, timing]) => {
        if (!timing.end) {
          return undefined;
        }
        const duration = (timing.end! - timing.start).toFixed(0);
        return `${slugify(key)};${
          timing.desc ? `desc=${timing.desc};` : ""
        }dur=${duration}`;
      }).filter(Boolean)
      .join(", ");
  };

  return {
    start,
    end,
    printTimings,
  };
}
