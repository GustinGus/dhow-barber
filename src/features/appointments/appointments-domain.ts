import type { LegacyAppointment, LegacyDatabase } from "@/types/legacy-database";

/** Same labels as the legacy `STATUS_LABEL`. */
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  reagendamento: "Reagendar",
  concluido: "Concluído",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

/** Statuses the legacy page lists under "Próximos" while the date has not passed. */
const OPEN_STATUSES = new Set(["pendente", "confirmado", "reagendamento"]);
/** Statuses the legacy page lets the client cancel. */
const CANCELLABLE_STATUSES = new Set(["pendente", "confirmado"]);

export const MIN_PHONE_DIGITS = 10;

export interface ClientAppointments {
  upcoming: LegacyAppointment[];
  history: LegacyAppointment[];
}

export function getPhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isSearchablePhone(digits: string): boolean {
  return digits.length >= MIN_PHONE_DIGITS;
}

export function getAppointmentStatusLabel(status: string): string {
  return APPOINTMENT_STATUS_LABELS[status] ?? status;
}

export function canClientCancel(appointment: LegacyAppointment): boolean {
  return CANCELLABLE_STATUSES.has(appointment.status);
}

/**
 * Port of the legacy `buscarMeus`: exact match on `telDigits`, sorted by date and time;
 * open appointments from today on are "upcoming", everything else is history, newest first.
 */
export function findClientAppointments(
  database: LegacyDatabase,
  phoneDigits: string,
  today: string,
): ClientAppointments {
  const appointments = (database.agendamentos ?? [])
    .filter((appointment) => appointment.telDigits === phoneDigits)
    .sort((first, second) => `${first.data}${first.hora}`.localeCompare(`${second.data}${second.hora}`));
  const upcoming = appointments.filter(
    (appointment) => appointment.data >= today && OPEN_STATUSES.has(appointment.status),
  );
  const history = appointments.filter((appointment) => !upcoming.includes(appointment)).reverse();
  return { upcoming, history };
}

/** Port of the legacy `cancelarCliente`: only the status changes, every other field is kept. */
export function cancelClientAppointment(database: LegacyDatabase, appointmentId: string): LegacyDatabase {
  const target = database.agendamentos.find((appointment) => appointment.id === appointmentId);
  if (!target) throw new Error("Este agendamento não foi encontrado.");
  if (!canClientCancel(target)) throw new Error("Este agendamento não pode mais ser cancelado.");

  return {
    ...database,
    agendamentos: database.agendamentos.map((appointment) =>
      appointment.id === appointmentId ? { ...appointment, status: "cancelado" } : appointment,
    ),
  };
}
