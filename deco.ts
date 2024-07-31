/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import "./utils/patched_fetch.ts";

import { AsyncLocalStorage } from "node:async_hooks";
import type { ImportMap } from "./blocks/app.ts";
import type { ReleaseResolver } from "./engine/core/mod.ts";
import type { DecofileProvider } from "./engine/decofile/provider.ts";
import type { AppManifest } from "./mod.ts";
import { randId } from "./utils/rand.ts";

export interface DecoRuntimeState<
  TAppManifest extends AppManifest = AppManifest,
> {
  manifest: TAppManifest;
  // deno-lint-ignore no-explicit-any
  resolver: ReleaseResolver<any>;
  importMap: ImportMap;
}

export interface InstanceInfo {
  startedAt: Date;
  id: string;
  readyAt?: Date;
}

export type RequestContext = {
  /** Cancelation token used for early processing halt */
  signal?: AbortSignal;
  framework?: "fresh" | "htmx";
};

export type WellKnownHostingPlatform =
  | "kubernetes"
  | "denodeploy"
  | "localhost";

export type DecodMode = "sidecar" | "embedded";

export const DaemonMode = {
  Sidecar: "sidecar" as DecodMode,
  Embedded: "embedded" as DecodMode,
};

// The global deco context
export interface DecoContext<TAppManifest extends AppManifest = AppManifest> {
  deploymentId: string | undefined;
  isDeploy: boolean;
  decodMode?: DecodMode;
  platform: WellKnownHostingPlatform;
  site: string;
  siteId: number;
  loginUrl?: string;
  base?: string;
  namespace?: string;
  release?: DecofileProvider;
  runtime?: Promise<DecoRuntimeState<TAppManifest>>;
  instance: InstanceInfo;
  request?: RequestContext;
}

const deploymentId = Deno.env.get("DENO_DEPLOYMENT_ID");
const isDeploy = Boolean(deploymentId);

const getHostingPlatform = (): WellKnownHostingPlatform => {
  const kService = Deno.env.get("K_SERVICE") !== undefined;

  if (kService) {
    return "kubernetes";
  } else if (isDeploy) {
    return "denodeploy";
  } else {
    return "localhost";
  }
};

// deno-lint-ignore no-explicit-any
const defaultContext: Omit<DecoContext<any>, "schema"> = {
  deploymentId,
  siteId: 0,
  isDeploy: isDeploy,
  decodMode: Deno.env.get("DECOD_MODE") as DecodMode | undefined,
  platform: getHostingPlatform(),
  site: "",
  instance: {
    id: randId(),
    startedAt: new Date(),
  },
};

const asyncLocalStorage = new AsyncLocalStorage<DecoContext>();

export const Context = {
  // Function to retrieve the active context
  active: <T extends AppManifest = AppManifest>(): DecoContext<T> => {
    // Retrieve the context associated with the async ID
    return asyncLocalStorage.getStore() ?? defaultContext;
  },
  bind: <R, TArgs extends unknown[]>(
    ctx: DecoContext,
    f: (...args: TArgs) => R,
  ): (...args: TArgs) => R => {
    return (...args: TArgs): R => {
      return asyncLocalStorage.run(ctx, f, ...args);
    };
  },
};

export const RequestContext = {
  active: () => Context.active().request,
  bind: <R, TArgs extends unknown[]>(
    request: RequestContext,
    f: (...args: TArgs) => R,
  ): (...args: TArgs) => R => {
    return Context.bind({ ...Context.active(), request }, f);
  },
  get signal() {
    return Context.active().request?.signal;
  },
  get framework() {
    return Context.active().request?.framework ?? "fresh";
  },
};

export const context = Context.active();
