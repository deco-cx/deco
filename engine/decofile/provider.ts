import * as colors from "@std/fmt/colors";
import { exists } from "@std/fs";
import { join } from "@std/path";
import type { Resolvable } from "../core/resolver.ts";
import type { PromiseOrValue } from "../core/utils.ts";
import { ENTRYPOINT } from "./constants.ts";
import { fromEndpoint } from "./fetcher.ts";
import { newFsProvider } from "./fs.ts";

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
  onChange(callback: OnChangeCallback): Disposable;
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
        const disposable = providers.onChange(cb);
        const currentDisposable = current.onChange(cb);
        return {
          [Symbol.dispose]: () => {
            disposable[Symbol.dispose]();
            currentDisposable[Symbol.dispose]();
          },
        };
      },
      notify: async () => {
        await Promise.all([
          providers.notify?.(),
          current.notify?.(),
        ]);
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

// if decofile does not exist but blocks exist so it should be lazy
const BLOCKS_FOLDER = join(Deno.cwd(), ".deco", "blocks");
const blocksFolderExistsPromise = exists(BLOCKS_FOLDER, {
  isDirectory: true,
  isReadable: true,
});
const DECOFILE_PATH_FROM_ENV = Deno.env.get(DECOFILE_RELEASE_ENV_VAR);

const respectDecofileProviders = [
  "deconfig://",
  "file:///app/decofile/decofile.json",
  "file:///app/decofile/decofile.bin", // brotli-compressed decofile
  // An EXPLICIT remote release over HTTP(S) — e.g. the operator's s3 target sets
  // DECO_RELEASE=https://…/decofile.json. Honor it OVER a baked `.deco/blocks`
  // folder: otherwise a site with blocks in its image would ignore the remote
  // release and cold-start from the (stale) built-in folder, losing every
  // content update delivered out-of-band (fast-deploy).
  "https://",
  "http://",
];

/**
 * Whether an explicit `DECO_RELEASE` should be honored OVER a baked
 * `.deco/blocks` folder. True for deconfig / a mounted decofile file / an
 * explicit http(s) endpoint — all deliberate sources that must win over the
 * folder. A bare folder is used only when `DECO_RELEASE` is unset or a scheme we
 * don't front-load. Pure (no env/fs) so the precedence is unit-testable.
 */
export const shouldRespectDecoRelease = (
  release: string | undefined,
): boolean => respectDecofileProviders.some((p) => release?.startsWith(p));
/**
 * Compose `config` and `pages` tables into a single ConfigStore provider given the impression that they are a single source of truth.
 * @param ns the site namespace
 * @param site the site name
 * @param siteId the site Id (if exists)
 * @returns the config store provider.
 */
export const getProvider = async (
  localStorageOnly = false,
): Promise<DecofileProvider> => {
  const providers = [];

  if (Deno.env.has("USE_LOCAL_STORAGE_ONLY") || localStorageOnly) {
    return newFsProvider();
  }

  const endpoint = await blocksFolderExistsPromise &&
      !shouldRespectDecoRelease(DECOFILE_PATH_FROM_ENV)
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
  }

  if (Deno.env.has("USE_LOCAL_STORAGE")) {
    providers.push(newFsProvider());
  }

  return compose(
    ...providers,
  );
};
