import { getCookies } from "std/http/mod.ts";
import { createClient, SupabaseClient } from "supabase";

let client: SupabaseClient | null = null;

// From supabase docs:
// "This key is safe to use in a browser if you have enabled Row Level Security for your tables and configured policies."
const SUPABASE_LIVE_ENDPOINT = "https://ozksgdmyrqcxcwhnbepg.supabase.co";
const SUPABASE_LIVE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96a3NnZG15cnFjeGN3aG5iZXBnIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NTY3MjM3NDYsImV4cCI6MTk3MjI5OTc0Nn0.HMdsG6NZlq6dvYFCK1_tuJh38TmsqLeN8H4OktTHt_M";

let userEndpoint = SUPABASE_LIVE_ENDPOINT;
let userKey = SUPABASE_LIVE_ANON_KEY;

export function setupSupabase(endpoint: string, key: string) {
  userEndpoint = endpoint;
  userKey = key;
}

export default function getSupabaseClient(accessToken?: string) {
  if (!client) {
    client = createClient(userEndpoint, accessToken || userKey);
  }

  return client;
}

export function getSupabaseClientForUser(req: Request) {
  const client = createClient(userEndpoint, userKey);
  const cookies = getCookies(req.headers);
  const jwt = cookies["live-access-token"];
  client.auth.setAuth(jwt);
  return client;
}
