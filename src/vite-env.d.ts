/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Data source for the app: "local" (default) or "supabase". */
  readonly VITE_DATA_SOURCE?: string;
  /** Supabase project URL (public). */
  readonly VITE_SUPABASE_URL?: string;
  /** Supabase anon/publishable key (public by design; protection comes from RLS and RPCs). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}
