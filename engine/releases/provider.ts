import { Resolvable } from "../../engine/core/resolver.ts";
import { fromPagesTable } from "../../engine/releases/pages.ts";
import { fromConfigsTable } from "../../engine/releases/release.ts";
import { SelectionConfig } from "../../handlers/routesSelection.ts";
import { ENTRYPOINT } from "./constants.ts";
import { fromEndpoint } from "./fetcher.ts";
import { newFsProvider } from "./fs.ts";
import { newRealtime } from "./realtime.ts";

export type OnChangeCallback = () => void;
export interface ReadOptions {
  forceFresh?: boolean;
}
export interface Release {
  state(options?: ReadOptions): Promise<Record<string, Resolvable>>;
  archived(options?: ReadOptions): Promise<Record<string, Resolvable>>;
  revision(): Promise<string>;
  onChange(callback: OnChangeCallback): void;
  dispose?: () => void;
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
      dispose: () => {
        providers?.dispose?.();
        current?.dispose?.();
      },
      onChange: (cb) => {
        providers.onChange(cb);
        current.onChange(cb);
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

const DECO_RELEASE_VERSION_ENV_VAR = "DECO_RELEASE";
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

  const endpoint = Deno.env.get(DECO_RELEASE_VERSION_ENV_VAR);
  if (endpoint) {
    providers.push(fromEndpoint(endpoint));
  } else {
    if (siteId > 0) {
      providers.push(newRealtime(fromPagesTable(siteId, ns), true)); // if not deploy so no background is needed
    }

    providers.push(newRealtime(fromConfigsTable(site), true)); // if not deploy so no background is needed
  }

  if (Deno.env.has("USE_LOCAL_STORAGE")) {
    providers.push(newFsProvider());
  }

  return compose(
    ...providers,
  );
};
