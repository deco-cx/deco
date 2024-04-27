import * as colors from "std/fmt/colors.ts";
import { exists } from "std/fs/mod.ts";
import { join } from "std/path/mod.ts";
import type { Resolvable } from "../core/resolver.ts";
import type { PromiseOrValue } from "../core/utils.ts";
import { ENTRYPOINT } from "./constants.ts";
import { fromEndpoint } from "./fetcher.ts";
import { newFsProvider } from "./fs.ts";
import { fromPagesTable } from "./pages.ts";
import { newRealtime } from "./realtime.ts";
import { fromConfigsTable } from "./release.ts";

export interface SelectionConfig {
  audiences: unknown[];
}

export type Decofile = Record<string, Resolvable>;
export type OnChangeCallback = () => PromiseOrValue<void>;
export interface ReadOptions {
  forceFresh?: boolean;
}
export interface DecofileProvider {
  state(options?: ReadOptions): Promise<Decofile>;
  revision(): Promise<string>;
  onChange(callback: OnChangeCallback): void;
  notify?(): Promise<void>;
  dispose?: () => void;
  set?(state: Decofile, revision?: string): Promise<void>;
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

export const compose = (...providers: DecofileProvider[]): DecofileProvider => {
  return providers.reduce((providers, current) => {
    return {
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

const DECOFILE_RELEASE_ENV_VAR = "DECO_RELEASE";

const DECO_FOLDER = ".deco";
// if decofile does not exists but blocks exists so it should be lazy
const BLOCKS_FOLDER = join(Deno.cwd(), DECO_FOLDER, "blocks");
const blocksFolderExistsPromise = exists(BLOCKS_FOLDER, {
  isDirectory: true,
  isReadable: true,
});
const DECOFILE_PATH_FROM_ENV = Deno.env.get(DECOFILE_RELEASE_ENV_VAR);

/**
 * Compose `config` and `pages` tables into a single ConfigStore provider given the impression that they are a single source of truth.
 * @param ns the site namespace
 * @param site the site name
 * @param siteId the site Id (if exists)
 * @returns the config store provider.
 */
export const getProvider = async (
  ns: string,
  site: string,
  siteId = -1,
  localStorageOnly = false,
): Promise<DecofileProvider> => {
  const providers = [];

  if (Deno.env.has("USE_LOCAL_STORAGE_ONLY") || localStorageOnly) {
    return newFsProvider();
  }

  const endpoint = await blocksFolderExistsPromise
    ? `folder://${BLOCKS_FOLDER}`
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
