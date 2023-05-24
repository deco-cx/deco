import { supabase } from "$live/deps.ts";
import { singleFlight } from "$live/engine/core/utils.ts";
import getSupabaseClient from "$live/supabase.ts";
import {
  CurrResolvables,
  SupabaseReleaseProvider,
} from "./supabaseProvider.ts";

const TABLE = "configs";
const fetchRelease = (
  site: string,
): PromiseLike<{ data: CurrResolvables | null; error: unknown }> => {
  return getSupabaseClient().from(TABLE).select("state, archived").eq(
    "site",
    site,
  ).maybeSingle();
};

// Supabase client setup
const subscribeForReleaseChanges = (
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
 * Create a supabase release provider based on `configs` table.
 * @param site the site name
 * @returns the supabaseReleaseProvider.
 */
export const fromConfigsTable = (
  site: string,
): SupabaseReleaseProvider => {
  const sf = singleFlight<{ data: CurrResolvables | null; error: unknown }>();
  const fetcher = () =>
    sf.do(
      "flight",
      async () => {
        const { data, error } = await fetchRelease(site);
        return { data: data ?? { state: {}, archived: {} }, error };
      },
    );
  return {
    get: fetcher,
    subscribe: subscribeForReleaseChanges(site),
  };
};
