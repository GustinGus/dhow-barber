import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import BookingFlow from "@/features/booking/BookingFlow";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";
import type { LegacyAppointment, LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;

function clearStorage() {
  window.localStorage.clear();
  window.sessionStorage.clear();
  delete window.storage;
}

async function reachReview(container: HTMLElement) {
  const calendar = container.querySelector(".booking-calendar");
  if (!calendar) throw new Error("Calendar was not rendered.");
  const availableDate = [...calendar.querySelectorAll<HTMLButtonElement>("button[data-day]")]
    .find((button) => !button.disabled);
  if (!availableDate) throw new Error("No available date was rendered.");
  fireEvent.click(availableDate);

  await screen.findByRole("heading", { name: "Escolha seu horário" });
  const firstSlot = container.querySelector<HTMLButtonElement>(".booking-slot");
  if (!firstSlot) throw new Error("No available time slot was rendered.");
  fireEvent.click(firstSlot);
  await screen.findByRole("heading", { name: "Seus dados" });

  fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Cliente Novo" } });
  fireEvent.change(screen.getByLabelText("Telefone / WhatsApp"), { target: { value: "11912345678" } });
  fireEvent.click(screen.getByText("PIX"));
  fireEvent.change(screen.getByLabelText("Observação (opcional)"), { target: { value: "Sem pressa" } });
  fireEvent.click(screen.getByRole("button", { name: "Continuar" }));

  await screen.findByRole("heading", { name: "Confira seu agendamento" });
}

function getSummaryRows(container: HTMLElement) {
  return [...container.querySelectorAll(".booking-summary__row")].map((row) => [
    row.querySelector("dt")?.textContent,
    row.querySelector("dd")?.textContent,
  ]);
}

async function completeBooking(container: HTMLElement) {
  await reachReview(container);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar solicitação" }));
  return screen.findByRole("heading", { name: "Solicitação enviada" });
}

describe("React booking flow", () => {
  beforeEach(clearStorage);
  afterEach(() => {
    cleanup();
    delete window.storage;
  });

  it("follows the requested five stages and saves a legacy appointment", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));
    const { container } = render(<BookingFlow />);

    await screen.findByRole("heading", { name: "O que você deseja fazer?" });
    expect(container.querySelectorAll(".booking-progress li")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: /Corte de cabelo/ }));
    await screen.findByRole("heading", { name: "Escolha uma data" });
    await completeBooking(container);

    const saved = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)!) as LegacyDatabase;
    expect(saved.agendamentos).toHaveLength(fixture.agendamentos.length + 1);
    const created = saved.agendamentos.at(-1) as LegacyAppointment;
    expect(created).toMatchObject({
      cliente: "Cliente Novo",
      telefone: "(11) 91234-5678",
      telDigits: "11912345678",
      servicoId: "s1",
      pagamento: "PIX",
      obs: "Sem pressa",
      status: "pendente",
    });
    expect(created.id).toBeTruthy();
    expect(created.codigo).toMatch(/^DB-[A-Z0-9]{4}$/);
    expect(created.criadoEm).toBeTruthy();
    expect(saved.campoLegadoDesconhecido).toEqual({ manter: true });
    // The fixture has no dataVersion, so it is saved already migrated, as the legacy page would do.
    expect(saved.dataVersion).toBe(2);
    expect(saved.servicos.map((service) => service.id)).toEqual(["s1", "s2", "s3", "s4", "s5", "s6"]);
    expect(saved.servicos[0].duracao).toBe(45);
    expect(saved.agendamentos.slice(0, -1)).toEqual(fixture.agendamentos);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.lastPhone)).toBe("11912345678");
  });

  it("shows a textual service price in the review in the legacy position", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));
    const { container } = render(<BookingFlow />);

    await screen.findByRole("heading", { name: "O que você deseja fazer?" });
    expect(screen.getByRole("button", { name: /Coloração/ }).textContent).toContain("Verificar com o Dhow");
    fireEvent.click(screen.getByRole("button", { name: /Coloração/ }));
    await screen.findByRole("heading", { name: "Escolha uma data" });
    await reachReview(container);

    const rows = getSummaryRows(container);
    expect(rows.slice(0, 3)).toEqual([
      ["Cliente", "Cliente Novo"],
      ["Serviço", "Coloração"],
      ["Valor", "Verificar com o Dhow"],
    ]);
    expect(rows).toContainEqual(["Duração", "30 min"]);
    const saved = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)!) as LegacyDatabase;
    expect(saved.agendamentos).toHaveLength(fixture.agendamentos.length);
  });

  it("formats durations of 60 minutes or more like the legacy site", async () => {
    const database = structuredClone(fixture);
    database.servicos = database.servicos.map((item) => item.id === "s1" ? { ...item, duracao: 90 } : item);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(database));
    const { container } = render(<BookingFlow />);

    await screen.findByRole("heading", { name: "O que você deseja fazer?" });
    expect(screen.getByRole("button", { name: /Corte de cabelo/ }).textContent).toContain("1h30");
    fireEvent.click(screen.getByRole("button", { name: /Corte de cabelo/ }));
    await screen.findByRole("heading", { name: "Escolha uma data" });
    expect(screen.getByText("1h30 reservados para o atendimento.")).toBeTruthy();
    await reachReview(container);

    const rows = getSummaryRows(container);
    expect(rows).toContainEqual(["Duração", "1h30"]);
    expect(rows).toContainEqual(["Valor", "R$ 40,00"]);
    expect(container.textContent).not.toContain("90 min");
  });

  it("starts at the date stage for a valid service deep link", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));
    render(<BookingFlow initialServiceId="s1" />);

    expect(await screen.findByRole("heading", { name: "Escolha uma data" })).toBeTruthy();
    expect(screen.getByText(/Corte de cabelo/)).toBeTruthy();
  });

  it("rechecks the slot against the latest database before writing", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));
    const { container } = render(<BookingFlow />);
    await screen.findByRole("heading", { name: "O que você deseja fazer?" });
    fireEvent.click(screen.getByRole("button", { name: /Corte de cabelo/ }));
    await screen.findByRole("heading", { name: "Escolha uma data" });
    const calendar = container.querySelector(".booking-calendar")!;
    const availableDate = [...calendar.querySelectorAll<HTMLButtonElement>("button[data-day]")]
      .find((button) => !button.disabled)!;
    const dayLabel = availableDate.getAttribute("data-day");
    fireEvent.click(availableDate);
    await screen.findByRole("heading", { name: "Escolha seu horário" });
    const slot = container.querySelector<HTMLButtonElement>(".booking-slot");
    if (!slot) throw new Error("No available time slot was rendered.");
    const selectedTime = slot.textContent?.trim().replace(/\D/g, "") ?? "";
    fireEvent.click(slot);
    await screen.findByRole("heading", { name: "Seus dados" });
    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Cliente Novo" } });
    fireEvent.change(screen.getByLabelText("Telefone / WhatsApp"), { target: { value: "11912345678" } });
    fireEvent.click(screen.getByText("PIX"));
    fireEvent.click(screen.getByRole("button", { name: "Continuar" }));
    await screen.findByRole("heading", { name: "Confira seu agendamento" });

    const latest = structuredClone(fixture);
    const [firstPart, secondPart, year] = dayLabel!.split("/");
    const [day, month] = Number(firstPart) > 12
      ? [firstPart, secondPart]
      : [secondPart, firstPart];
    const dateKey = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    const [hour, minute] = selectedTime.match(/.{1,2}/g)!.map(Number);
    const blockedTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    latest.agendamentos.push({
      ...latest.agendamentos[0],
      id: "concurrent",
      data: dateKey,
      hora: blockedTime,
      duracao: 45,
      status: "confirmado",
    });
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(latest));

    fireEvent.click(screen.getByRole("button", { name: "Confirmar solicitação" }));

    expect((await screen.findByRole("alert")).textContent).toContain("Esse horário acabou de ser ocupado");
    expect(screen.getByRole("heading", { name: "Escolha seu horário" })).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)!) as LegacyDatabase;
    expect(saved.agendamentos).toHaveLength(fixture.agendamentos.length + 1);
  });
});