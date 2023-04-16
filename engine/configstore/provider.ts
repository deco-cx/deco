import { fromConfigsTable } from "$live/engine/configstore/configs.ts";
import { fromPagesTable } from "$live/engine/configstore/pages.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { context } from "$live/live.ts";
import { newSupabase } from "./supabaseProvider.ts";

export interface ReadOptions {
  forceFresh?: boolean;
}
export interface ConfigStore {
  state(options?: ReadOptions): Promise<Record<string, Resolvable>>;
  archived(options?: ReadOptions): Promise<Record<string, Resolvable>>;
}

export const compose = (...providers: ConfigStore[]): ConfigStore => {
  return providers.reduce((providers, current) => {
    return {
      archived: async (options) => {
        const [providersResolvables, currentResolvables] = await Promise.all([
          providers.archived(options),
          current.archived(options),
        ]);
        return { ...providersResolvables, ...currentResolvables };
      },
      state: async (options) => {
        const [providersResolvables, currentResolvables] = await Promise.all([
          providers.state(options),
          current.state(options),
        ]);
        return { ...providersResolvables, ...currentResolvables };
      },
    };
  });
};

export const getComposedConfigStore = (
  ns: string,
  site: string,
  siteId: number,
): ConfigStore => {
  if (siteId <= 0) { // new sites does not have siteId
    return newSupabase(fromConfigsTable(site));
  }
  return compose(
    newSupabase(fromPagesTable(siteId, ns), context.isDeploy), // if not deploy so no background is needed
    newSupabase(fromConfigsTable(site), context.isDeploy),
  );
};
