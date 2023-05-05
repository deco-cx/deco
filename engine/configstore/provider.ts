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

/**
 * Compose `config` and `pages` tables into a single ConfigStore provider given the impression that they are a single source of truth.
 * @param ns the site namespace
 * @param site the site name
 * @param siteId the site Id (if exists)
 * @returns the config store provider.
 */
export const getComposedConfigStore = (
  ns: string,
  site: string,
  siteId: number,
): ConfigStore => {
  const providers = [];

  if (siteId > 0) {
    providers.push(newSupabase(fromPagesTable(siteId, ns), context.isDeploy)); // if not deploy so no background is needed
  }

  providers.push(newSupabase(fromConfigsTable(site), context.isDeploy)); // if not deploy so no background is needed

  if (Deno.env.has("USE_LOCAL_STORAGE")) {
    providers.push(newFsProvider());
  }

  return compose(
    ...providers,
  );
};
