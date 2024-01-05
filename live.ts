/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import { SourceMap } from "./blocks/app.ts";
import { ReleaseResolver } from "./engine/core/mod.ts";
import { Release } from "./engine/releases/provider.ts";
import { AppManifest } from "./mod.ts";
import asyncHooks from "node:async_hooks";

export interface DecoRuntimeState {
  manifest: AppManifest;
  // deno-lint-ignore no-explicit-any
  resolver: ReleaseResolver<any>;
  sourceMap: SourceMap;
}

export interface InstanceInfo {
  startedAt: Date;
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

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
const _context: DecoContext = {
  deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
  isDeploy: Boolean(Deno.env.get("DENO_DEPLOYMENT_ID")),
  site: "",
  siteId: 0,
  play: false,
  instance: {
    startedAt: new Date(),
  },
};

// Map to store contexts associated with async IDs
const contextMap = new Map<number, DecoContext>();

// Create a new AsyncHooks instance
const asyncHook = asyncHooks.createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    // Initialize a context for the async ID
    contextMap.set(asyncId, _context);
  },
  destroy(asyncId) {
    // Clean up the context when the async ID is destroyed
    contextMap.delete(asyncId);
  },
});

// Enable the AsyncHooks instance
asyncHook.enable();

// Function to retrieve the active context
export function getCurrentContext() {
  // Get the current async ID
  const asyncId = asyncHooks.executionAsyncId();
  console.log({asyncId});

  // Retrieve the context associated with the async ID
  return contextMap.get(asyncId) || _context;
}

// Example usage
export const context = getCurrentContext();


