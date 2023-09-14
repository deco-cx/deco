/// <reference no-default-lib="true"/>
/// <reference lib="deno.ns" />
/// <reference lib="esnext" />
/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

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
};

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
export const context: DecoContext = {
  deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
  isDeploy: Boolean(Deno.env.get("DENO_DEPLOYMENT_ID")),
  site: "",
  siteId: 0,
};
