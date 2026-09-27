import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readSupabaseConfig, type SupabaseConfig, SupabaseNotConfiguredError } from "./config";
import type { Database } from "./database.types";

export type DhowSupabaseClient = SupabaseClient<Database>;

let cachedClient: DhowSupabaseClient | null = null;

/**
 * Creates the browser client on first use only, so importing this module never fails
 * when the environment has no Supabase settings. Uses the anon key: every access is
 * limited by RLS and the public RPCs.
 */
export function getSupabaseClient(config: SupabaseConfig | null = readSupabaseConfig()): DhowSupabaseClient {
  if (!config) throw new SupabaseNotConfiguredError();
  // Public (anonymous) access only for now; the Admin phase will enable auth sessions.
  cachedClient ??= createClient<Database>(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return cachedClient;
}
