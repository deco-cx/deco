import type { supabase } from "../../deps.ts";
import { singleFlight } from "../core/utils.ts";
import getSupabaseClient from "../../supabase.ts";
import { randId as ulid } from "../../utils/rand.ts";
import type {
  RealtimeDecofileProvider,
  VersionedDecofile,
} from "./realtime.ts";

const TABLE = "configs";
const fetchDecofile = (
  site: string,
): PromiseLike<{ data: VersionedDecofile | null; error: unknown }> => {
  return getSupabaseClient().from(TABLE).select("state, revision").eq(
    "site",
    site,
  ).maybeSingle();
};

const JITTER_TIME_MS = 2000;
type Fetcher = () => ReturnType<typeof fetchDecofile>;
// Supabase client setup
const subscribeForDecofileChanges = (
  site: string,
  fetcher: Fetcher,
) =>
(
  callback: (res: VersionedDecofile) => unknown,
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
      (payload) => {
        const newPayload = payload.new as VersionedDecofile;
        if (newPayload?.state === undefined) {
          console.warn("state is too big, fetching from supabase");
          // we have added a jitter of 2s to prevent too many requests being issued at same time.
          const jitter = Math.floor(JITTER_TIME_MS * Math.random());
          setTimeout(() => {
            fetcher().then(async (resp) => {
              const { data, error } = resp;
              if (error || !data) {
                console.error("error when fetching config", error, "retrying");
                const { data: secondTryData, error: secondTryError } =
                  await fetcher();

                if (secondTryError || !secondTryData) {
                  console.error("error when fetching config", error);
                  return;
                }

                callback(secondTryData);
                return;
              }
              callback(data);
            });
          }, jitter);
        } else {
          callback(newPayload);
        }
      },
    )
    .subscribe(subscriptionCallback);
};

/**
 * Create a supabase decofile provider based on `configs` table.
 * @param site the site name
 * @returns the supabaseDecofileProvider.
 */
export const fromConfigsTable = (
  site: string,
): RealtimeDecofileProvider => {
  const sf = singleFlight<{ data: VersionedDecofile | null; error: unknown }>();
  const fetcher = () =>
    sf.do(
      "flight",
      async () => {
        const { data, error } = await fetchDecofile(site);
        return {
          data: data ??
            { state: {}, revision: ulid() },
          error,
        };
      },
    );
  return {
    get: fetcher,
    subscribe: subscribeForDecofileChanges(site, fetcher),
  };
};
