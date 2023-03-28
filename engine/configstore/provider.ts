import { Resolvable } from "$live/engine/core/resolver.ts";
import getSupabaseClient from "$live/supabase.ts";
import { context } from "$live/live.ts";

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

// export const instance = async (): Promise<ConfigStore> => {
//   // try to find from site using configs table
//   const supabase = getSupabaseClient();
//   const { data, error } = await supabase.from("configs").select("*", {
//     count: "exact",
//     head: true,
//   }).eq("site", context.site);
//   if (error !== null && )
// };
