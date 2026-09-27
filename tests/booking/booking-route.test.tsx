import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import App from "@/app/App";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";
import type { LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;

describe("modern app booking route", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.storage;
    window.location.hash = "";
  });

  afterEach(() => {
    cleanup();
    delete window.storage;
    window.location.hash = "";
  });

  it("opens the booking flow with a service preselected and returns to the landing", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));
    window.location.hash = "#/agendar?s=s1";
    const { container } = render(<App />);

    expect(await screen.findByRole("heading", { name: "Escolha uma data" })).toBeTruthy();
    expect(screen.getByText(/Corte de cabelo/)).toBeTruthy();
    fireEvent.click(screen.getByRole("link", { name: "Voltar ao site Dhow Barber" }));

    await waitFor(() => expect(screen.getByRole("heading", { name: "O que a gente faz" })).toBeTruthy());
    expect(container.querySelector(".public-site")).toBeTruthy();
  });

  it("routes landing booking CTAs locally and leaves section anchors in the landing", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));
    const { container } = render(<App />);

    fireEvent.click(screen.getByRole("link", { name: "Agendar Corte de cabelo" }));
    expect(await screen.findByRole("heading", { name: "Escolha uma data" })).toBeTruthy();
    expect(window.location.hash).toBe("#/agendar?s=s1");

    fireEvent.click(screen.getByRole("link", { name: "Voltar ao site Dhow Barber" }));
    await screen.findByRole("heading", { name: "O que a gente faz" });
    fireEvent.click(screen.getByRole("link", { name: "Conhecer serviços" }));
    await waitFor(() => expect(window.location.hash).toBe("#servicos"));
    expect(container.querySelector(".public-site")).toBeTruthy();
  });
});