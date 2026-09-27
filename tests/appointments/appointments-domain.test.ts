import { describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import {
  canClientCancel,
  cancelClientAppointment,
  findClientAppointments,
  getAppointmentStatusLabel,
  isSearchablePhone,
} from "@/features/appointments/appointments-domain";
import type { LegacyAppointment, LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;
const base = fixture.agendamentos[0];

function appointment(patch: Partial<LegacyAppointment>): LegacyAppointment {
  return { ...base, ...patch };
}

function databaseWith(appointments: LegacyAppointment[]): LegacyDatabase {
  return { ...structuredClone(fixture), agendamentos: appointments };
}

describe("client appointments domain", () => {
  it("matches the phone digits exactly, like the legacy search", () => {
    const database = databaseWith([
      appointment({ id: "mine", telDigits: "11912345678" }),
      appointment({ id: "other", telDigits: "11987654321" }),
      appointment({ id: "prefix", telDigits: "119123456789" }),
    ]);

    const result = findClientAppointments(database, "11912345678", "2026-10-01");
    expect([...result.upcoming, ...result.history].map((item) => item.id)).toEqual(["mine"]);
  });

  it("splits upcoming open appointments from history and orders both like the legacy page", () => {
    const database = databaseWith([
      appointment({ id: "later", data: "2026-10-20", hora: "09:00", status: "confirmado" }),
      appointment({ id: "today", data: "2026-10-10", hora: "16:00", status: "pendente" }),
      appointment({ id: "reschedule", data: "2026-10-15", hora: "10:00", status: "reagendamento" }),
      appointment({ id: "future-cancelled", data: "2026-10-12", hora: "10:00", status: "cancelado" }),
      appointment({ id: "future-refused", data: "2026-10-11", hora: "10:00", status: "recusado" }),
      appointment({ id: "past-pending", data: "2026-10-09", hora: "18:00", status: "pendente" }),
      appointment({ id: "done", data: "2026-09-01", hora: "10:00", status: "concluido" }),
    ]);

    const result = findClientAppointments(database, base.telDigits, "2026-10-10");
    expect(result.upcoming.map((item) => item.id)).toEqual(["today", "reschedule", "later"]);
    expect(result.history.map((item) => item.id)).toEqual([
      "future-cancelled",
      "future-refused",
      "past-pending",
      "done",
    ]);
  });

  it("returns empty lists when the phone has no appointments or the database has none", () => {
    expect(findClientAppointments(fixture, "11000000000", "2026-10-01")).toEqual({ upcoming: [], history: [] });
    expect(findClientAppointments(databaseWith([]), base.telDigits, "2026-10-01")).toEqual({ upcoming: [], history: [] });
  });

  it("requires a phone with area code", () => {
    expect(isSearchablePhone("119123456")).toBe(false);
    expect(isSearchablePhone("1191234567")).toBe(true);
  });

  it("uses the legacy status labels and keeps unknown statuses readable", () => {
    expect(getAppointmentStatusLabel("reagendamento")).toBe("Reagendar");
    expect(getAppointmentStatusLabel("concluido")).toBe("Concluído");
    expect(getAppointmentStatusLabel("em-espera")).toBe("em-espera");
  });

  it("lets the client cancel only pending or confirmed appointments", () => {
    expect(["pendente", "confirmado", "reagendamento", "concluido", "recusado", "cancelado"]
      .filter((status) => canClientCancel(appointment({ status })))).toEqual(["pendente", "confirmado"]);
  });

  it("cancels by changing only the status and keeps every other record and field", () => {
    const database = databaseWith([
      appointment({ id: "keep", status: "confirmado" }),
      appointment({ id: "cancel", status: "pendente", campoExtra: 7 }),
    ]);

    const updated = cancelClientAppointment(database, "cancel");
    expect(updated.agendamentos).toEqual([
      database.agendamentos[0],
      { ...database.agendamentos[1], status: "cancelado" },
    ]);
    expect(updated.campoLegadoDesconhecido).toEqual({ manter: true });
    expect(database.agendamentos[1].status).toBe("pendente");
  });

  it("refuses to cancel a missing or closed appointment", () => {
    const database = databaseWith([appointment({ id: "done", status: "concluido" })]);
    expect(() => cancelClientAppointment(database, "missing")).toThrow("não foi encontrado");
    expect(() => cancelClientAppointment(database, "done")).toThrow("não pode mais ser cancelado");
  });
});
