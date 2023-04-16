import { supabase } from "$live/deps.ts";
import { singleFlight } from "$live/engine/core/utils.ts";
import getSupabaseClient from "$live/supabase.ts";
import { CurrResolvables, SupabaseConfigProvider } from "./supabaseProvider.ts";

const TABLE = "configs";
const fetchConfigs = (
  site: string,
): PromiseLike<{ data: CurrResolvables | null; error: unknown }> => {
  return getSupabaseClient().from(TABLE).select("state, archived").eq(
    "site",
    site,
  ).maybeSingle();
};

// Supabase client setup
const subscribeForConfigChanges = (
  site: string,
) =>
(
  callback: (res: CurrResolvables) => unknown,
  subscriptionCallback: (
    status: `${supabase.REALTIME_SUBSCRIBE_STATES}`,
    err?: Error,
  ) => void,
) => {
  return getSupabaseClient()
    .channel("changes")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: TABLE,
        filter: `site=eq.${site}`,
      },
      (payload) => callback(payload.new as CurrResolvables),
    )
    .subscribe(subscriptionCallback);
};

/**
 * Create a supabase config provider based on `configs` table.
 * @param site the site name
 * @returns the supabaseconfigprovider.
 */
export const fromConfigsTable = (
  site: string,
): SupabaseConfigProvider => {
  const sf = singleFlight<{ data: CurrResolvables | null; error: unknown }>();
  const fetcher = () => sf.do("flight", async () => await fetchConfigs(site));
  return {
    get: fetcher,
    subscribe: subscribeForConfigChanges(site),
  };
};
