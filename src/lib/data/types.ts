import type { BookingConfirmation, BookingDraft } from "@/features/booking/booking-types";
import type { PublicSiteContent } from "@/features/public/public-content";
import type { LegacyDatabase } from "@/types/legacy-database";

/**
 * Data the booking and client screens work on: services, hours, blocks, config and
 * appointments, in the legacy shape the domain rules (availability, search) already use.
 */
export type DataSnapshot = LegacyDatabase;

/** Raised when the chosen time was taken between showing it and saving the appointment. */
export class SlotUnavailableError extends Error {
  constructor(message = "Esse horário acabou de ser ocupado. Escolha outro horário.") {
    super(message);
    this.name = "SlotUnavailableError";
  }
}

export interface SiteContentRepository {
  /** Public landing content; falls back to the defaults when nothing is saved. */
  getSiteContent(): Promise<PublicSiteContent>;
}

export interface BookingRepository {
  /** Snapshot used to offer services, dates and free times. */
  getSnapshot(): Promise<DataSnapshot>;
  /**
   * Re-checks the slot against the latest data and saves the appointment.
   * `loadedSnapshot` is the snapshot the screen is showing, used when nothing is saved yet.
   * Throws SlotUnavailableError when the time is no longer free.
   */
  createAppointment(draft: BookingDraft, loadedSnapshot: DataSnapshot): Promise<BookingConfirmation>;
}

export interface ClientAppointmentsRepository {
  /** Snapshot the client's appointments are searched in. */
  getSnapshot(): Promise<DataSnapshot>;
  /** Cancels a client appointment against the latest data and returns the updated snapshot. */
  cancelAppointment(appointmentId: string): Promise<DataSnapshot>;
}

/** Preferences kept only on this device (never shared). */
export interface ClientDeviceStore {
  /** Last phone used on this device, or "" when unavailable. */
  getLastPhone(): string;
  /** Remembers the phone; failures are ignored because the flow works without it. */
  rememberPhone(phoneDigits: string): void;
}

/**
 * Admin operations, planned for the Admin phase with Supabase Auth. Not implemented yet:
 * they depend on an authenticated admin (private.admin_users) and must go through RLS and
 * `admin_set_appointment_status`, never through the service_role key.
 */
export interface AdminAppointmentsRepository {
  setAppointmentStatus(appointmentId: string, status: string): Promise<void>;
}

export interface DataRepositories {
  siteContent: SiteContentRepository;
  booking: BookingRepository;
  clientAppointments: ClientAppointmentsRepository;
  clientDevice: ClientDeviceStore;
}
