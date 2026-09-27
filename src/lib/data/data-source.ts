import { readSupabaseConfig, type SupabaseEnv } from "@/lib/supabase/config";

export type DataSourceName = "local" | "supabase";

export interface DataSourceEnv extends SupabaseEnv {
  VITE_DATA_SOURCE?: string;
}

/**
 * Which data source the app should use. "local" unless VITE_DATA_SOURCE is exactly
 * "supabase" AND the public Supabase settings exist. Missing or incomplete settings keep
 * the app local, so builds without these variables (Production) are unaffected.
 */
export function resolveDataSource(env: DataSourceEnv = import.meta.env): DataSourceName {
  return env.VITE_DATA_SOURCE?.trim() === "supabase" && readSupabaseConfig(env) ? "supabase" : "local";
}
