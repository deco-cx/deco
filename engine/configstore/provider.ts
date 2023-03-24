import { Resolvable } from "$live/engine/core/resolver.ts";

export interface ConfigStore {
  get(): Promise<Record<string, Resolvable>>;
}

export const compose = (...providers: ConfigStore[]): ConfigStore => {
  return providers.reduce((providers, current) => {
    return {
      get: async () => {
        const [providersResolvables, currentResolvables] = await Promise.all([
          providers.get(),
          current.get(),
        ]);
        return { ...providersResolvables, ...currentResolvables };
      },
    };
  });
};
