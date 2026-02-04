import type { FieldResolver } from "../engine/core/resolver.ts";

export interface DebugProperties {
  resolver: FieldResolver;
}

export interface LoaderPreventingCache {
  loader: string;
  section?: string;
}

export interface Vary {
  push: (...key: string[]) => void;
  build: () => string;
  shouldCache: boolean;
  shouldCachePage: boolean;
  loadersPreventingCache: LoaderPreventingCache[];
  debug: {
    push: <T extends DebugProperties>(debug: T) => void;
    build: <T extends DebugProperties>() => T[];
  };
}

export const vary = (): Vary => {
  const vary: string[] = [];
  const debug: DebugProperties[] = [];
  const loadersPreventingCache: LoaderPreventingCache[] = [];

  return {
    push: (...key: string[]) => vary.push(...key),
    build: () => {
      return vary.sort().join();
    },
    shouldCache: true,
    shouldCachePage: true,
    loadersPreventingCache,
    debug: {
      push: <T extends DebugProperties>(_debug: T) =>
        debug.push(_debug as DebugProperties),
      build: <T extends DebugProperties>() => debug as T[],
    },
  };
};
