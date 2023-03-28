import {
  newSupabaseDeploy,
  newSupabaseLocal,
} from "$live/engine/configstore/supabase.ts";
import {
  newSupabaseProviderLegacyDeploy,
  newSupabaseProviderLegacyLocal,
} from "$live/engine/configstore/supabaseLegacy.ts";
import { Resolvable } from "$live/engine/core/resolver.ts";
import { context } from "$live/live.ts";
import getSupabaseClient from "$live/supabase.ts";

export interface ConfigStore {
  get(): Promise<Record<string, Resolvable>>;
}

export const compose = (...providers: ConfigStore[]): ConfigStore => {
  return providers.reduce((providers, current) => {
    return {
      get: async () => {
        const [providersResolvables, currentResolvables] = await Promise.all([
          providers.get(),
          current.get(),
        ]);
        return { ...providersResolvables, ...currentResolvables };
      },
    };
  });
};

export const instance = async (
  ns: string,
  site: string,
  siteId: number,
): Promise<ConfigStore> => {
  // try to find from site using configs table
  const supabase = getSupabaseClient();
  const { error, count } = await supabase.from("configs").select("*", {
    count: "exact",
    head: true,
  }).eq("site", context.site);
  if (error !== null && count === 1) {
    const provider = context.isDeploy ? newSupabaseDeploy : newSupabaseLocal;
    return provider(site);
  }
  const provider = context.isDeploy
    ? newSupabaseProviderLegacyDeploy
    : newSupabaseProviderLegacyLocal;
  return provider(siteId, ns);
};
