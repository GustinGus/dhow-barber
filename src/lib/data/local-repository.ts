import { cancelClientAppointment } from "@/features/appointments/appointments-domain";
import {
  appendLegacyAppointment,
  createFreshLegacyDatabase,
  getAvailableSlots,
  getEffectiveServiceDuration,
  getService,
} from "@/features/booking/booking-domain";
import { toPublicSiteContent } from "@/features/public/public-content";
import { readMigratedLegacyDatabase } from "@/lib/storage/legacy-migration";
import { readLegacyLastPhone, writeLegacyDatabase, writeLegacyLastPhone } from "@/lib/storage/legacy-storage";
import { type DataRepositories, SlotUnavailableError } from "./types";

/**
 * Repositories backed by the legacy browser storage (`dhow_barber_db_v1`, `dhow_last_phone`),
 * shared with public/legado.html. Reads migrate in memory only; writes store the whole
 * legacy database exactly as before.
 */
export function createLocalDataRepositories(): DataRepositories {
  return {
    siteContent: {
      async getSiteContent() {
        return toPublicSiteContent(await readMigratedLegacyDatabase());
      },
    },

    booking: {
      async getSnapshot() {
        return (await readMigratedLegacyDatabase()) ?? createFreshLegacyDatabase();
      },

      async createAppointment(draft, loadedSnapshot) {
        const latest = (await readMigratedLegacyDatabase()) ?? loadedSnapshot;
        const service = getService(latest, draft.servicoId);
        if (!service) throw new Error("Este serviço não está mais disponível.");

        const duration = getEffectiveServiceDuration(latest, service);
        if (!draft.data || !draft.hora || !getAvailableSlots(latest, draft.data, duration).includes(draft.hora)) {
          throw new SlotUnavailableError();
        }

        const confirmation = appendLegacyAppointment(latest, draft);
        await writeLegacyDatabase(confirmation.database);
        return confirmation;
      },
    },

    clientAppointments: {
      async getSnapshot() {
        return (await readMigratedLegacyDatabase()) ?? createFreshLegacyDatabase();
      },

      async cancelAppointment(appointmentId) {
        // Re-read so a change made meanwhile (e.g. by the barber) is not overwritten.
        const latest = await readMigratedLegacyDatabase();
        if (!latest) throw new Error("Este agendamento não foi encontrado.");
        const updated = cancelClientAppointment(latest, appointmentId);
        await writeLegacyDatabase(updated);
        return updated;
      },
    },

    clientDevice: {
      getLastPhone() {
        try {
          return readLegacyLastPhone();
        } catch {
          return "";
        }
      },

      rememberPhone(phoneDigits) {
        try {
          writeLegacyLastPhone(phoneDigits);
        } catch {
          // Storage can be blocked; the screens work without the remembered phone.
        }
      },
    },
  };
}
