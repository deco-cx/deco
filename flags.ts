import { Flag } from "$live/types.ts";
import { context } from "$live/server.ts";
import getSupabaseClient from "./supabase.ts";

let flags: Flag[];
export const flag = (id: string) => flags.find((flag) => flag.id === id);

export const ensureFlags = async () => {
  const site = context.site;

  // TODO: Cache flags stale for 5 minutes, refresh every 30s
  const { data: Flags, error } = await getSupabaseClient()
    .from("flags")
    .select(
      `id, name, audience, traffic, site!inner(name, id), pages!inner(data, path, id)`,
    )
    .eq("site.name", site);

  if (error) {
    console.log("Error fetching flags:", error);
  }

  flags = Flags as Flag[];
};
