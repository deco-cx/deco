import {
  newSupabaseDeploy,
  newSupabaseLocal,
  tryUseProvider,
} from "$live/engine/configstore/supabase.ts";
import {
  newSupabaseProviderLegacyDeploy,
  newSupabaseProviderLegacyLocal,
} from "$live/engine/configstore/supabaseLegacy.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { context } from "$live/live.ts";

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
  const configsTable = context.isDeploy ? newSupabaseDeploy : newSupabaseLocal;
  if (siteId <= 0) { // new sites does not have siteId
    return configsTable(site);
  }
  const pagesTable = context.isDeploy
    ? newSupabaseProviderLegacyDeploy
    : newSupabaseProviderLegacyLocal;
  return compose(pagesTable(siteId, ns), tryUseProvider(configsTable, site));
};
