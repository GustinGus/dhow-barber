import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import MyAppointments from "@/features/appointments/MyAppointments";
import { getLocalDateKey } from "@/features/booking/booking-domain";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";
import type { LegacyAppointment, LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;
const PHONE = "11912345678";

function dayFromToday(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return getLocalDateKey(date);
}

function clientAppointment(patch: Partial<LegacyAppointment>): LegacyAppointment {
  return {
    ...fixture.agendamentos[0],
    cliente: "Cliente Fiel",
    telefone: "(11) 91234-5678",
    telDigits: PHONE,
    ...patch,
  };
}

/** Fixture as saved by the legacy page, plus the client's own history. */
function seedDatabase(extra: LegacyAppointment[]): LegacyDatabase {
  const database = structuredClone(fixture);
  database.agendamentos = [...database.agendamentos, ...extra];
  window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(database));
  return database;
}

function savedDatabase(): LegacyDatabase {
  return JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)!) as LegacyDatabase;
}

function searchPhone(value: string) {
  fireEvent.change(screen.getByLabelText("Telefone"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
}

function listIds(title: string): string[] {
  const section = screen.getByRole("heading", { name: title }).closest("section")!;
  return [...section.querySelectorAll(".appointments-item__summary")].map((button) => button.textContent ?? "");
}

const history = [
  clientAppointment({ id: "next", codigo: "DB-NEXT", data: dayFromToday(3), hora: "10:00", status: "confirmado", pagamento: "PIX" }),
  clientAppointment({ id: "resched", codigo: "DB-RESC", data: dayFromToday(5), hora: "15:30", status: "reagendamento", servicoId: "s6" }),
  clientAppointment({ id: "old", codigo: "DB-OLD1", data: dayFromToday(-20), hora: "09:00", status: "concluido", obs: "Degradê baixo" }),
  clientAppointment({ id: "gone", codigo: "DB-GONE", data: dayFromToday(-3), hora: "11:00", status: "cancelado" }),
];

describe("React Meus agendamentos", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.storage;
  });

  afterEach(() => {
    cleanup();
    delete window.storage;
  });

  it("finds existing appointments by phone and splits upcoming from history", async () => {
    seedDatabase(history);
    const before = window.localStorage.getItem(LEGACY_STORAGE_KEYS.database);
    render(<MyAppointments />);
    await screen.findByRole("heading", { name: "Meus agendamentos" });

    searchPhone("11912345678");

    await screen.findByRole("heading", { name: "Próximos" });
    expect((screen.getByLabelText("Telefone") as HTMLInputElement).value).toBe("(11) 91234-5678");
    const upcoming = listIds("Próximos");
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0]).toContain("DB-NEXT");
    expect(upcoming[0]).toContain("Confirmado");
    expect(upcoming[1]).toContain("DB-RESC");
    expect(upcoming[1]).toContain("Reagendar");
    const past = listIds("Histórico");
    expect(past).toHaveLength(2);
    expect(past[0]).toContain("DB-GONE");
    expect(past[0]).toContain("Cancelado");
    expect(past[1]).toContain("DB-OLD1");
    expect(past[1]).toContain("Concluído");
    // The fixture's other client never shows up.
    expect(screen.queryByText(/DB-A123/)).toBeNull();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.lastPhone)).toBe(PHONE);
    // Reading never rewrites the shared legacy database.
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe(before);
  });

  it("searches the phone remembered by the booking flow as soon as it opens", async () => {
    seedDatabase(history);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.lastPhone, PHONE);
    render(<MyAppointments />);

    expect(await screen.findByRole("heading", { name: "Próximos" })).toBeTruthy();
    expect((screen.getByLabelText("Telefone") as HTMLInputElement).value).toBe("(11) 91234-5678");
    expect(screen.getByText(/DB-NEXT/)).toBeTruthy();
  });

  it("shows the empty state when the phone has no appointments", async () => {
    seedDatabase(history);
    render(<MyAppointments />);
    await screen.findByRole("heading", { name: "Meus agendamentos" });

    searchPhone("(11) 95555-4444");

    expect(await screen.findByText("Nenhum agendamento encontrado para esse telefone.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Agendar agora" }).getAttribute("href")).toBe("#/agendar");
    expect(screen.queryByRole("heading", { name: "Próximos" })).toBeNull();
  });

  it("shows the empty state when nothing was ever saved in this browser", async () => {
    render(<MyAppointments />);
    await screen.findByRole("heading", { name: "Meus agendamentos" });

    searchPhone(PHONE);

    expect(await screen.findByText("Nenhum agendamento encontrado para esse telefone.")).toBeTruthy();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBeNull();
  });

  it("keeps the history visible when there is no open appointment", async () => {
    seedDatabase(history.filter((item) => item.id === "old" || item.id === "gone"));
    render(<MyAppointments />);
    await screen.findByRole("heading", { name: "Meus agendamentos" });

    searchPhone(PHONE);

    expect(await screen.findByText("Você não tem agendamento em aberto.")).toBeTruthy();
    expect(listIds("Histórico")).toHaveLength(2);
  });

  it("asks for the full phone with area code before searching", async () => {
    seedDatabase(history);
    render(<MyAppointments />);
    await screen.findByRole("heading", { name: "Meus agendamentos" });

    searchPhone("91234");

    expect((await screen.findByRole("alert")).textContent).toBe("Informe o telefone completo com DDD.");
    expect(screen.queryByRole("heading", { name: "Próximos" })).toBeNull();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.lastPhone)).toBeNull();
  });

  it("shows the legacy details and the reschedule request", async () => {
    seedDatabase(history);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.lastPhone, PHONE);
    const { container } = render(<MyAppointments />);
    await screen.findByRole("heading", { name: "Próximos" });

    fireEvent.click(screen.getByRole("button", { name: /DB-OLD1/ }));
    const rows = [...container.querySelectorAll(".booking-summary__row")].map((row) => [
      row.querySelector("dt")?.textContent,
      row.querySelector("dd")?.textContent,
    ]);
    expect(rows).toEqual([
      ["Código", "DB-OLD1"],
      ["Cliente", "Cliente Fiel"],
      ["Telefone", "(11) 91234-5678"],
      ["Serviço", "Corte de cabelo"],
      ["Data", history[2].data.split("-").reverse().join("/")],
      ["Horário", "09:00 · 45 min"],
      ["Pagamento", "PIX"],
      ["Valor", "R$ 40,00"],
      ["Observação", "Degradê baixo"],
      ["Status", "Concluído"],
    ]);
    expect(screen.queryByRole("button", { name: "Cancelar agendamento" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /DB-RESC/ }));
    expect(screen.getByText("O barbeiro pediu para você escolher outro horário.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Escolher outro horário" }).getAttribute("href")).toBe("#/agendar");
    expect(screen.getByText("Verificar com o Dhow")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar agendamento" })).toBeNull();
  });

  it("cancels after confirmation, changing only that appointment's status", async () => {
    const seeded = seedDatabase(history);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.lastPhone, PHONE);
    render(<MyAppointments />);
    await screen.findByRole("heading", { name: "Próximos" });

    fireEvent.click(screen.getByRole("button", { name: /DB-NEXT/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar agendamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Manter agendamento" }));
    expect(savedDatabase().agendamentos).toEqual(seeded.agendamentos);

    // Meanwhile the barber confirms another appointment in the admin.
    const changedByAdmin = savedDatabase();
    changedByAdmin.agendamentos = changedByAdmin.agendamentos.map((item) =>
      item.id === "a1" ? { ...item, status: "confirmado" } : item,
    );
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(changedByAdmin));

    fireEvent.click(screen.getByRole("button", { name: "Cancelar agendamento" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelamento" }));

    expect((await screen.findByRole("status")).textContent).toBe("Agendamento cancelado.");
    await waitFor(() => expect(listIds("Próximos")).toHaveLength(1));
    // Newest first, as in the legacy history: the cancelled future date comes before past ones.
    expect(listIds("Histórico")[0]).toContain("DB-NEXT");

    const saved = savedDatabase();
    expect(saved.agendamentos).toEqual(changedByAdmin.agendamentos.map((item) =>
      item.id === "next" ? { ...item, status: "cancelado" } : item,
    ));
    expect(saved.campoLegadoDesconhecido).toEqual({ manter: true });
    expect(saved.portfolio).toEqual(fixture.portfolio);
    expect(saved.config).toEqual(fixture.config);
  });

  it("reads the database from window.storage when the legacy host provides it", async () => {
    const database = structuredClone(fixture);
    database.agendamentos.push(history[0]);
    window.storage = {
      get: async () => ({ value: JSON.stringify(database) }),
      set: async () => undefined,
    };
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.lastPhone, PHONE);
    render(<MyAppointments />);

    expect(await screen.findByText(/DB-NEXT/)).toBeTruthy();
  });
});
