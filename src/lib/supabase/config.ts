/** Public Supabase settings for the browser. Never holds the service_role key or any secret. */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

export class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase não está configurado neste ambiente.");
    this.name = "SupabaseNotConfiguredError";
  }
}

/** Reads the public Supabase settings; null when they are missing (the app then stays local). */
export function readSupabaseConfig(env: SupabaseEnv = import.meta.env): SupabaseConfig | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return { url, anonKey };
}
