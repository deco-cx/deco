// deno-lint-ignore-file no-explicit-any
import { propsLoader } from "$live/blocks/propsLoader.ts";
import { SectionModule } from "$live/blocks/section.ts";
import { FnProps } from "$live/blocks/utils.tsx";
import { Block, BlockModule, InstanceOf } from "$live/engine/block.ts";
import { mapObjKeys } from "$live/engine/core/utils.ts";
import {
  DOC_CACHE_FILE_NAME,
  hydrateDocCacheWith,
} from "$live/engine/schema/docCache.ts";
import { DecoManifest, FnContext } from "$live/types.ts";
import { once, SyncOnce } from "$live/utils/sync.ts";
import { fromFileUrl } from "std/path/mod.ts";

export type Apps = InstanceOf<typeof appBlock, "#/root/apps">;

export type AppManifest = Omit<DecoManifest, "baseUrl" | "islands" | "routes">;

export interface App<
  TAppManifest extends AppManifest = AppManifest,
  TAppState = any,
> {
  manifest: TAppManifest;
  state: TAppState;
}

export type AppContext<TApp extends Apps = Apps> = FnContext<
  TApp["state"],
  TApp["manifest"]
>;

export type AppFunc<
  TProps = any,
  TAppManifest extends AppManifest = AppManifest,
  TState = any,
> = (
  c: TProps,
) => App<TAppManifest, TState>;

export interface AppModule extends BlockModule<AppFunc> {
  name?: string;
  docCacheFileUrl?: string;
}

const injectAppState = <TState = any>(
  state: TState,
  fnProps: FnProps,
): FnProps => {
  return (
    props: any,
    request: Request,
    { response, get, invoke }: AppContext,
  ) => {
    return fnProps(props, request, { ...state, response, get, invoke });
  };
};

const injectAppStateOnInlineLoader = <TState = any>(
  state: TState,
  loader: SectionModule["loader"],
): FnProps | undefined => {
  if (!loader) {
    return undefined;
  }
  return (
    props: any,
    request: Request,
    { response, get, invoke }: AppContext,
  ) => {
    return propsLoader(loader, props, request, {
      ...state,
      response,
      get,
      invoke,
    });
  };
};
const injectAppStateOnManifest = <
  TState = any,
  TAppManifest extends AppManifest = AppManifest,
>(state: TState, manifest: TAppManifest): TAppManifest => {
  return {
    ...manifest,
    sections: mapObjKeys(
      manifest.sections ?? {},
      (mod) => ({
        ...mod,
        loader: injectAppStateOnInlineLoader(state, mod.loader),
      }),
    ),
    actions: mapObjKeys(
      manifest.actions ?? {},
      (mod) => ({ ...mod, default: injectAppState(state, mod.default) }),
    ),
    loaders: mapObjKeys(
      manifest.loaders ?? {},
      (mod) => ({ ...mod, default: injectAppState(state, mod.default) }),
    ),
  };
};

const hydrateOnce: Record<string, SyncOnce<void>> = {};
const appBlock: Block<AppModule> = {
  type: "apps",
  introspect: {
    default: "0",
  },
  adapt: <
    TProps = any,
  >({ default: fn, name, docCacheFileUrl }: AppModule) =>
  (props: TProps) => {
    if (!name) {
      throw new Error(
        "apps without a name is not support yet",
      );
    }
    const baseKey = import.meta.resolve(`${name}/`);
    const fileUrl = docCacheFileUrl ?? `${baseKey}${DOC_CACHE_FILE_NAME}`;
    hydrateOnce[name] ??= once<void>();
    hydrateOnce[name].do(() => {
      return hydrateDocCacheWith(
        fileUrl.startsWith("file:") ? fromFileUrl(fileUrl) : fileUrl,
        baseKey,
      );
    });
    const { state, manifest } = fn(props);
    return {
      state,
      manifest: injectAppStateOnManifest(state, manifest),
    };
  },
};

/**
 * <TState>(state:TState) => Manifest
 * The app block is used to configure platforms using settings
 */
export default appBlock;
