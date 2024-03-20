import * as colors from "std/fmt/colors.ts";
import { exists } from "std/fs/mod.ts";
import { join } from "std/path/mod.ts";
import { Resolvable } from "../../engine/core/resolver.ts";
import { PromiseOrValue } from "../../engine/core/utils.ts";
import { fromPagesTable } from "../../engine/releases/pages.ts";
import { fromConfigsTable } from "../../engine/releases/release.ts";
import { ENTRYPOINT } from "./constants.ts";
import { fromEndpoint } from "./fetcher.ts";
import { newFsProvider } from "./fs.ts";
import { newRealtime } from "./realtime.ts";

export interface SelectionConfig {
  audiences: unknown[];
}

export type OnChangeCallback = () => PromiseOrValue<void>;
export interface ReadOptions {
  forceFresh?: boolean;
}
export interface Release {
  state(options?: ReadOptions): Promise<Record<string, Resolvable>>;
  archived(options?: ReadOptions): Promise<Record<string, Resolvable>>;
  revision(): Promise<string>;
  onChange(callback: OnChangeCallback): void;
  notify?(): Promise<void>;
  dispose?: () => void;
  set?(state: Record<string, Resolvable>, revision?: string): Promise<void>;
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

export const DECOFILE_REL_PATH = ".deco/decofile.json";
const DECOFILE_PATH_DEFAULT = join(Deno.cwd(), DECOFILE_REL_PATH);
const decofileExistsPromise = exists(DECOFILE_PATH_DEFAULT, {
  isFile: true,
  isReadable: true,
});
const DECOFILE_PATH_FROM_ENV = Deno.env.get(DECO_RELEASE_VERSION_ENV_VAR);

/**
 * Compose `config` and `pages` tables into a single ConfigStore provider given the impression that they are a single source of truth.
 * @param ns the site namespace
 * @param site the site name
 * @param siteId the site Id (if exists)
 * @returns the config store provider.
 */
export const getRelease = async (
  ns: string,
  site: string,
  siteId = -1,
  localStorageOnly = false,
): Promise<Release> => {
  const providers = [];

  if (Deno.env.has("USE_LOCAL_STORAGE_ONLY") || localStorageOnly) {
    return newFsProvider();
  }

  const endpoint = await decofileExistsPromise
    ? `file://${DECOFILE_PATH_DEFAULT}`
    : DECOFILE_PATH_FROM_ENV;
  if (endpoint) {
    console.info(
      colors.brightCyan(
        `    ${
          colors.brightGreen("decofile")
        } has been loaded from ${endpoint}`,
      ),
    );
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
