import { type DataSourceName, resolveDataSource } from "./data-source";
import { createLazySupabaseDataRepositories } from "./lazy-supabase-repository";
import { createLocalDataRepositories } from "./local-repository";
import type { DataRepositories } from "./types";

export * from "./types";
export { createLocalDataRepositories } from "./local-repository";

/** "supabase" only with VITE_DATA_SOURCE=supabase and the public Supabase settings; otherwise local. */
export function selectDataRepositories(source: DataSourceName = resolveDataSource()): DataRepositories {
  return source === "supabase" ? createLazySupabaseDataRepositories() : createLocalDataRepositories();
}

/** Repositories used by the app, chosen at build time from the VITE_ variables. */
export const dataRepositories = selectDataRepositories();
