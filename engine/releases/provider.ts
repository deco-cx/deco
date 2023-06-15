import { Resolvable } from "$live/engine/core/resolver.ts";
import { fromPagesTable } from "$live/engine/releases/pages.ts";
import { fromConfigsTable } from "$live/engine/releases/release.ts";
import { context } from "$live/live.ts";
import { SelectionConfig } from "../../handlers/routesSelection.ts";
import { ENTRYPOINT } from "./constants.ts";
import { newFsProvider } from "./fs.ts";
import { newSupabase } from "./supabaseProvider.ts";

export interface ReadOptions {
  forceFresh?: boolean;
}
export interface Release {
  state(options?: ReadOptions): Promise<Record<string, Resolvable>>;
  archived(options?: ReadOptions): Promise<Record<string, Resolvable>>;
  revision(): Promise<string>;
}

interface RoutesSelection extends SelectionConfig {
  __resolveType: "$live/handlers/routesSelection.ts";
}
const isSelectionConfig = (
  config: unknown | RoutesSelection,
): config is RoutesSelection => {
  return (config as RoutesSelection)?.audiences?.length !== undefined &&
    (config as RoutesSelection)?.__resolveType ===
      "$live/handlers/routesSelection.ts";
};

const mergeEntrypoints = (
  config: unknown,
  other: unknown,
): unknown => {
  if (isSelectionConfig(config) && isSelectionConfig(other)) {
    return {
      audiences: [...config.audiences, ...other.audiences],
      __resolveType: config?.__resolveType ?? other?.__resolveType,
    };
  }
  return other ?? config;
};

export const compose = (...providers: Release[]): Release => {
  return providers.reduce((providers, current) => {
    return {
      archived: async (options) => {
        const [providersResolvables, currentResolvables] = await Promise.all([
          providers.archived(options),
          current.archived(options),
        ]);
        return {
          ...providersResolvables,
          ...currentResolvables,
          [ENTRYPOINT]: mergeEntrypoints(
            providersResolvables[ENTRYPOINT],
            currentResolvables[ENTRYPOINT],
          ),
        };
      },
      revision: () => {
        return Promise.all([
          providers.revision(),
          current.revision(),
        ]).then((revisions) => revisions.join());
      },
      state: async (options) => {
        const [providersResolvables, currentResolvables] = await Promise.all([
          providers.state(options),
          current.state(options),
        ]);
        return {
          ...providersResolvables,
          ...currentResolvables,
          [ENTRYPOINT]: mergeEntrypoints(
            (providersResolvables ?? {})[ENTRYPOINT],
            (currentResolvables ?? {})[ENTRYPOINT],
          ),
        };
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
  localStorageOnly = false,
): Release => {
  const providers = [];

  if (Deno.env.has("USE_LOCAL_STORAGE_ONLY") || localStorageOnly) {
    return newFsProvider();
  }

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
