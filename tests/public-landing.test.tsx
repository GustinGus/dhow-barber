import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import PublicLandingPage from "@/features/public/PublicLandingPage";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";
import type { LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;

describe("public landing page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.storage;
  });

  afterEach(() => {
    cleanup();
    delete window.storage;
  });

  it("shows the legacy public content without requiring stored data", async () => {
    render(<PublicLandingPage />);

    expect(screen.getByRole("heading", { name: /seu estilo/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "O que a gente faz" })).toBeTruthy();
    expect(screen.getByText("Corte + Sobrancelha")).toBeTruthy();
    expect(document.querySelector("address")?.textContent).toContain("R. Profa. Olga Nilza Dos Santos Machado, 24");

    await waitFor(() => expect(screen.getAllByText("5,0").length).toBeGreaterThan(0));
    expect(
      screen.getAllByRole("link", { name: "Agendar agora" })
        .some((link) => link.getAttribute("href") === "#/agendar"),
    ).toBe(true);
    expect(document.querySelector(".hero-section__image")?.getAttribute("src")).toContain("portfolio-cover");
    expect(document.querySelector(".brand-wordmark__logo")?.getAttribute("src")).toContain("dhow-logo");
  });

  it("loads saved legacy services and portfolio without writing to storage", async () => {
    const database = structuredClone(fixture);
    database.config.nome = "Dhow Barber Teste";
    database.dataVersion = 2;
    database.servicos = [
      {
        id: "legacy-service",
        nome: "Serviço legado",
        desc: "",
        preco: 35,
        duracao: null,
        ativo: true,
      },
    ];
    database.portfolio = [
      {
        id: "legacy-photo",
        image: "data:image/jpeg;base64,legacy-image",
        caption: "Foto já cadastrada",
        instagramUrl: "https://www.instagram.com/p/example/",
        ativo: true,
      },
    ];
    const originalJson = JSON.stringify(database);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, originalJson);

    render(<PublicLandingPage />);

     expect(await screen.findByText("Serviço legado")).toBeTruthy();
     expect(screen.getByText("Foto já cadastrada")).toBeTruthy();
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe(originalJson);
  });

  it("shows v1 services the same way the legacy migration does, without writing", async () => {
    const database = structuredClone(fixture);
    delete database.dataVersion;
    database.config.nome = "Dhow Barber V1";
    database.servicos = [
      { id: "s2", nome: "Barba", desc: "", preco: 25, duracao: 30, ativo: true },
    ];
    const originalJson = JSON.stringify(database);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, originalJson);

    render(<PublicLandingPage />);

    await waitFor(() => expect(screen.getAllByText(/Dhow Barber V1/).length).toBeGreaterThan(0));
    const serviceLinks = [...document.querySelectorAll(".service-list .service-link")];
    expect(serviceLinks.map((link) => link.getAttribute("aria-label"))).toEqual([
      "Agendar Corte de cabelo",
      "Agendar Corte + Sobrancelha",
      "Agendar Barba",
      "Agendar Corte + Barba",
      "Agendar Sobrancelha",
      "Agendar Coloração",
    ]);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe(originalJson);
  });

  it("keeps service, map, WhatsApp, and Instagram links actionable", async () => {
    render(<PublicLandingPage />);

    const serviceLink = await screen.findByRole("link", { name: "Agendar Corte de cabelo" });
     expect(serviceLink.getAttribute("href")).toBe("#/agendar?s=s1");

    const mapLink = screen.getByRole("link", { name: /como chegar/i });
    expect(mapLink.getAttribute("href")).toContain("google.com/maps/search");

     expect(screen.getByRole("link", { name: /whatsapp/i }).getAttribute("href")).toBe("https://wa.me/5511941465958");
    expect(
      document.querySelectorAll('a[href="https://www.instagram.com/dhowbarber_/"]').length,
    ).toBeGreaterThan(0);
  });
});