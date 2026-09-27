import { createLocalDataRepositories } from "./local-repository";
import type { SupabaseDataRepositories } from "./supabase-repository";
import type { DataRepositories } from "./types";

async function loadSupabaseRepositories(): Promise<SupabaseDataRepositories> {
  // Dynamic imports: the Supabase SDK and repository go to a separate chunk that is only
  // downloaded when the app runs with VITE_DATA_SOURCE=supabase and calls a repository.
  const [{ createSupabaseDataRepositories }, { getSupabaseClient }] = await Promise.all([
    import("./supabase-repository"),
    import("@/lib/supabase/client"),
  ]);
  return createSupabaseDataRepositories({ client: () => getSupabaseClient() });
}

/**
 * Supabase repositories behind the same contracts, loaded on first use. A failed load is
 * not cached, so the next call can try again.
 */
export function createLazySupabaseDataRepositories(
  load: () => Promise<SupabaseDataRepositories> = loadSupabaseRepositories,
): DataRepositories {
  let pending: Promise<SupabaseDataRepositories> | null = null;
  const remote = () => {
    pending ??= load().catch((error: unknown) => {
      pending = null;
      throw error;
    });
    return pending;
  };

  return {
    siteContent: {
      getSiteContent: async () => (await remote()).siteContent.getSiteContent(),
    },
    booking: {
      getSnapshot: async () => (await remote()).booking.getSnapshot(),
      createAppointment: async (draft, loadedSnapshot) =>
        (await remote()).booking.createAppointment(draft, loadedSnapshot),
    },
    clientAppointments: {
      getSnapshot: async () => (await remote()).clientAppointments.getSnapshot(),
      cancelAppointment: async (appointmentId) =>
        (await remote()).clientAppointments.cancelAppointment(appointmentId),
    },
    // The remembered phone is a device preference in both data sources.
    clientDevice: createLocalDataRepositories().clientDevice,
  };
}
