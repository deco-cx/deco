export interface Timing {
  name: string;
  desc?: string;
  start: number;
  end?: number;
}

export function createServerTimings() {
  const timings: Timing[] = [];

  const start = (name: string, desc?: string, start?: number) => {
    const t: Timing = { name, desc, start: start || performance.now() };

    timings.push(t);

    return {
      end: () => {
        t.end = performance.now();
      },
      setDesc: (desc: string | undefined) => {
        t.desc = desc;
      },
      name: () => t.name,
    };
  };

  const printTimings = () =>
    timings
      .map(({ name, desc, start, end }) => {
        if (!end || !name) return;

        return `${encodeURIComponent(name)}${desc ? `;desc=${desc}` : ""};dur=${
          (end - start).toFixed(0)
        }`;
      })
      .filter(Boolean)
      .join(", ");

  const get = (): readonly Timing[] => timings;

  return {
    get,
    start,
    printTimings,
  };
}
