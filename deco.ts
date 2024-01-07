/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { AsyncLocalStorage } from "node:async_hooks";
import { SourceMap } from "./blocks/app.ts";
import { ReleaseResolver } from "./engine/core/mod.ts";
import { Release } from "./engine/releases/provider.ts";
import { AppManifest } from "./mod.ts";

export interface DecoRuntimeState {
  manifest: AppManifest;
  // deno-lint-ignore no-explicit-any
  resolver: ReleaseResolver<any>;
  sourceMap: SourceMap;
}

export interface InstanceInfo {
  startedAt: Date;
  id: string;
  readyAt?: Date;
}

// The global deco context
export type DecoContext = {
  deploymentId: string | undefined;
  isDeploy: boolean;
  site: string;
  siteId: number;
  loginUrl?: string;
  base?: string;
  namespace?: string;
  release?: Release;
  runtime?: Promise<DecoRuntimeState>;
  play?: boolean;
  instance: InstanceInfo;
};

const defaultContext: Omit<DecoContext, "schema"> = {
  deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
  isDeploy: Boolean(Deno.env.get("DENO_DEPLOYMENT_ID")),
  site: "",
  siteId: 0,
  play: false,
  instance: {
    id: crypto.randomUUID(),
    startedAt: new Date(),
  },
};

// Map to store contexts associated with async IDs
const contextMap = new Map<string, DecoContext>();

const asyncLocalStorage = new AsyncLocalStorage();

export const withContext = <R, TArgs extends unknown[]>(
  ctx: DecoContext,
  f: (...args: TArgs) => R,
): (...args: TArgs) => R => {
  const id = ctx?.instance?.id ?? crypto.randomUUID();
  contextMap.set(id, ctx);

  return (...args: TArgs): R => {
    try {
      return asyncLocalStorage.run(id, f, ...args);
    } finally {
      contextMap.delete(id);
    }
  };
};

export const Context = {
  // Function to retrieve the active context
  active: () => {
    const asyncId = asyncLocalStorage.getStore() as string;
    if (typeof asyncId !== "string") {
      return defaultContext;
    }

    // Retrieve the context associated with the async ID
    return contextMap.get(asyncId) || defaultContext;
  },
};

export const context = Context.active();
