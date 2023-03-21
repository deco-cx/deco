import { Resolvable } from "$live/engine/core/resolver.ts";

export interface ConfigStore {
  onChange(cb: () => void): void;
  // deno-lint-ignore no-explicit-any
  get(): Promise<Record<string, Resolvable<any>>>;
}

export const compose = (...providers: ConfigStore[]): ConfigStore => {
  return providers.reduce((providers, current) => {
    return {
      onChange: (cb) => {
        providers.onChange(cb);
        current.onChange(cb);
      },
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
