/// <reference no-default-lib="true" />
/// <reference lib="dom" />
/// <reference lib="dom.asynciterable" />
/// <reference lib="deno.ns" />
/// <reference lib="deno.unstable" />

import { Plugin, start as freshStart, StartOptions } from "$fresh/server.ts";

import { DecoManifest, LiveOptions } from "$live/types.ts";

// The global live context
export type LiveContext = {
  manifest?: DecoManifest;
  deploymentId: string | undefined;
  domains: string[];
  site: string;
  siteId: number;
  loginUrl?: string;
  plugins: Plugin[];
};

// While Fresh doesn't allow for injecting routes and middlewares,
// we have to deliberately store the manifest in this scope.
export const context: LiveContext = {
  deploymentId: Deno.env.get("DENO_DEPLOYMENT_ID"),
  domains: ["localhost"],
  site: "",
  siteId: 0,
  plugins: [],
};

export const start = async (
  manifest: DecoManifest,
  liveOptions?: LiveOptions & StartOptions,
) => {
  if (!liveOptions) {
    throw new Error("liveOptions is required.");
  }
  if (!liveOptions.site) {
    throw new Error(
      "liveOptions.site is required. It should be the name of the site you created in deco.cx.",
    );
  }
  if (!liveOptions.siteId) {
    throw new Error(
      "liveOptions.siteId is required. You can get it from the site URL: https://deco.cx/live/{siteId}",
    );
  }

  const plugins = liveOptions.plugins || [];
  const envPort = Deno.env.get("PORT");
  const port = envPort ? parseInt(envPort) : (liveOptions.port ?? 8080);
  context.manifest = manifest;
  context.site = liveOptions.site;
  context.siteId = liveOptions.siteId;
  context.loginUrl = liveOptions.loginUrl;
  context.plugins = liveOptions.plugins || [];
  context.domains.push(
    `${liveOptions.site}.deco.page`,
    `${liveOptions.site}.deco.site`,
    `deco-pages-${liveOptions.site}.deno.dev`,
    `deco-sites-${liveOptions.site}.deno.dev`,
  );
  liveOptions.domains?.forEach((domain) => context.domains.push(domain));
  // Support deploy preview domains
  if (context.deploymentId !== undefined) {
    context.domains.push(
      `deco-pages-${context.site}-${context.deploymentId}.deno.dev`,
    );
    context.domains.push(
      `deco-sites-${context.site}-${context.deploymentId}.deno.dev`,
    );
  }

  console.log(
    `Starting live server: siteId=${context.siteId} site=${context.site}`,
  );

  await freshStart(manifest, {
    port,
    plugins,
  });
};
