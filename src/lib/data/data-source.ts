import { readSupabaseConfig, type SupabaseEnv } from "@/lib/supabase/config";

export type DataSourceName = "local" | "supabase";

export interface DataSourceEnv extends SupabaseEnv {
  VITE_DATA_SOURCE?: string;
}

/**
 * Which data source the app should use. "local" unless VITE_DATA_SOURCE is exactly
 * "supabase" AND the public Supabase settings exist.
 *
 * Not wired into `dataRepositories` yet: the switch to Supabase is a later, joint phase
 * (booking + my appointments + admin). Until then the app is always local.
 */
export function resolveDataSource(env: DataSourceEnv = import.meta.env): DataSourceName {
  return env.VITE_DATA_SOURCE?.trim() === "supabase" && readSupabaseConfig(env) ? "supabase" : "local";
}
