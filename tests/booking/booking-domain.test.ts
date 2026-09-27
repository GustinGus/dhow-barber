import { describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import { formatServiceDuration, formatServicePrice } from "@/features/public/public-content";
import {
  appendLegacyAppointment,
  createFreshLegacyDatabase,
  formatLegacyDate,
  getAvailableSlots,
  getBookingWindow,
  getEffectiveServiceDuration,
  isBookingDayOpen,
  maskLegacyPhone,
  shiftBookingWindow,
  validateBookingDraft,
} from "@/features/booking/booking-domain";
import type { BookingDraft } from "@/features/booking/booking-types";
import type { LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;
const monday = "2026-10-05";
const sunday = "2026-10-04";

function draft(overrides: Partial<BookingDraft> = {}): BookingDraft {
  return {
    servicoId: "s1",
    data: monday,
    hora: "11:00",
    pagamento: "PIX",
    nome: "Cliente Novo",
    telefone: "(11) 91234-5678",
    obs: "",
    ...overrides,
  };
}

describe("legacy booking domain", () => {
  it("uses configured service duration and falls back to the legacy interval", () => {
    expect(getEffectiveServiceDuration(fixture, fixture.servicos[0])).toBe(45);
    expect(getEffectiveServiceDuration(fixture, fixture.servicos[1])).toBe(30);
  });

  it("uses the free schedule range even when a weekly day is closed", () => {
    expect(isBookingDayOpen(fixture, sunday)).toBe(true);
    const slots = getAvailableSlots(fixture, sunday, 30, new Date("2026-09-27T07:00:00"));
    expect(slots[0]).toBe("08:00");
    expect(slots.at(-1)).toBe("19:30");
  });

  it("uses weekday opening hours after free mode is disabled and configured", () => {
    const database = structuredClone(fixture);
    database.horarios.livre = false;
    database.horarios.configurado = true;

    expect(isBookingDayOpen(database, sunday)).toBe(false);
    expect(getAvailableSlots(database, sunday, 30, new Date("2026-09-27T07:00:00"))).toEqual([]);
    expect(isBookingDayOpen(database, monday)).toBe(true);
    expect(getAvailableSlots(database, monday, 30, new Date("2026-09-27T07:00:00"))).toContain("09:00");
  });

  it("excludes full-day and partial blocks, lunch, and pending/confirmed overlaps", () => {
    const database = structuredClone(fixture);
    database.bloqueios.push({
      id: "partial",
      dataIni: monday,
      dataFim: monday,
      diaTodo: false,
      ini: "14:00",
      fim: "15:00",
      motivo: "Compromisso",
    });
    database.agendamentos.push({
      ...database.agendamentos[0],
      id: "confirmed",
      data: monday,
      hora: "15:00",
      duracao: 45,
      status: "confirmado",
    });
    database.agendamentos.push({
      ...database.agendamentos[0],
      id: "completed",
      data: monday,
      hora: "11:00",
      duracao: 45,
      status: "concluido",
    });

    const slots = getAvailableSlots(database, monday, 45, new Date("2026-09-27T07:00:00"));
    expect(slots).not.toContain("09:30");
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).not.toContain("11:30");
    expect(slots).not.toContain("13:30");
    expect(slots).not.toContain("15:00");
    expect(slots).toContain("11:00");
    expect(slots).toContain("16:00");

    database.bloqueios.push({
      id: "full-day",
      dataIni: monday,
      dataFim: monday,
      diaTodo: true,
      ini: "00:00",
      fim: "23:59",
      motivo: "Dia fechado",
    });
    expect(getAvailableSlots(database, monday, 30, new Date("2026-09-27T07:00:00"))).toEqual([]);
  });

  it("respects the 15-minute lead time for today and appointment end time", () => {
    const today = "2026-09-27";
    const database = structuredClone(fixture);
    database.horarios.livreIni = "08:00";
    database.horarios.livreFim = "09:30";
    database.horarios.almoco.ativo = false;
    database.agendamentos = [];

    const slots = getAvailableSlots(database, today, 30, new Date("2026-09-27T08:16:00"));
    expect(slots).not.toContain("08:00");
    expect(slots).not.toContain("08:30");
    expect(slots).toContain("09:00");
    expect(getAvailableSlots(database, today, 45, new Date("2026-09-27T08:16:00"))).not.toContain("09:00");
  });

  it("shows seven local dates and clamps previous-week navigation to today", () => {
    const now = new Date(2026, 8, 27, 10, 0);
    const window = getBookingWindow("2026-09-20", now);
    expect(window.base).toBe("2026-09-27");
    expect(window.dates).toHaveLength(7);
    expect(window.dates[0]).toBe("2026-09-27");
    expect(window.dates[6]).toBe("2026-10-03");
    expect(shiftBookingWindow("2026-09-27", -7, now)).toBe("2026-09-27");
    expect(shiftBookingWindow("2026-09-27", 7, now)).toBe("2026-10-04");
  });

  it("keeps the legacy phone validation and mask limits", () => {
    expect(validateBookingDraft(draft({ nome: " A ", telefone: "(11) 1234-5678" }))).toEqual({
      nome: "Informe seu nome.",
    });
    expect(validateBookingDraft(draft({ telefone: "123" }))).toEqual({
      telefone: "Informe um telefone com DDD.",
    });
    expect(validateBookingDraft(draft())).toEqual({});
    expect(maskLegacyPhone("119123456789999")).toBe("(11) 91234-5678");
  });

  it("appends the legacy appointment shape without mutating other data", () => {
    const original = structuredClone(fixture);
    const originalJson = JSON.stringify(original);
    const ids = ["newid123", "code4567"];
    const result = appendLegacyAppointment(original, draft(), {
      now: new Date("2026-09-27T12:00:00.000Z"),
      uid: () => ids.shift()!,
    });

    expect(JSON.stringify(original)).toBe(originalJson);
    expect(result.database.campoLegadoDesconhecido).toEqual({ manter: true });
    expect(result.database.config).toEqual(original.config);
    expect(result.database.horarios).toEqual(original.horarios);
    expect(result.database.bloqueios).toEqual(original.bloqueios);
    expect(result.database.servicos).toEqual(original.servicos);
    expect(result.database.agendamentos).toHaveLength(original.agendamentos.length + 1);
    expect(result.appointment).toEqual({
      id: "newid123",
      codigo: "DB-CODE",
      cliente: "Cliente Novo",
      telefone: "(11) 91234-5678",
      telDigits: "11912345678",
      servicoId: "s1",
      data: monday,
      hora: "11:00",
      duracao: 45,
      pagamento: "PIX",
      obs: "",
      status: "pendente",
      criadoEm: "2026-09-27T12:00:00.000Z",
    });
  });

  it("creates a version-2 compatible seed only for an empty store", () => {
    const database = createFreshLegacyDatabase();
    expect(database.dataVersion).toBe(2);
    expect(database.config.nome).toBe("Dhow Barber");
    expect(database.horarios.livre).toBe(true);
    expect(database.horarios.livreIni).toBe("08:00");
    expect(database.horarios.livreFim).toBe("20:00");
    expect(database.servicos.map((service) => service.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(database.agendamentos).toEqual([]);
  });

  it("formats dates the same way as the legacy summary", () => {
    expect(formatLegacyDate(monday)).toBe("05/10/2026");
  });

  it("formats durations with the legacy durTxt rules", () => {
    expect(formatServiceDuration(30)).toBe("30 min");
    expect(formatServiceDuration(45)).toBe("45 min");
    expect(formatServiceDuration(60)).toBe("1h");
    expect(formatServiceDuration(90)).toBe("1h30");
    expect(formatServiceDuration(120)).toBe("2h");
    expect(formatServiceDuration(135)).toBe("2h15");
  });

  it("keeps textual prices and formats numeric prices as BRL", () => {
    expect(formatServicePrice("Verificar com o Dhow")).toBe("Verificar com o Dhow");
    expect(formatServicePrice(40)).toBe("R$ 40,00");
    expect(formatServicePrice(null)).toBe("Valor sob consulta");
  });
});