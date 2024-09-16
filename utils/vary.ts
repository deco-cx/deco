export interface Vary {
  push: (...key: string[]) => void;
  build: () => string;
  shouldCache: boolean;
}

export const vary = (): Vary => {
  const vary: string[] = [];

  return {
    push: (...key: string[]) => vary.push(...key),
    build: () => {
      return vary.sort().join();
    },
    shouldCache: true,
  };
};
