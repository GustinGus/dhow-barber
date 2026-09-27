import { readFileSync } from "node:fs";
import path from "node:path";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import App from "@/app/App";
import { getLegacyPageUrl, getLegacySectionId, isLegacyRoute } from "@/app/legacy-routes";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";

const routeSamples = [
  "",
  "#",
  "#/",
  "#top",
  "#servicos",
  "#/#servicos",
  "#/#portfolio",
  "#/agendar",
  "#/agendar?s=s1",
  "#/meus",
  "#/meus?tel=11912345678",
  "#/admin",
  "#/admin/agenda",
  "#/administrar",
  "#/outra-rota",
];

/** Runs the return script's rule from public/legado.html against a given hash. */
function loadLegacyPageRule(): (hash: string) => boolean {
  const html = readFileSync(path.resolve(__dirname, "../../public/legado.html"), "utf8");
  const match = html.match(/function rotaLegada\(\)\{[\s\S]*?\n {2}\}/);
  if (!match) throw new Error("Return script not found in public/legado.html.");
  const rule = new Function("location", `${match[0]}\nreturn rotaLegada();`);
  return (hash) => rule({ hash }) as boolean;
}

function setHash(hash: string) {
  window.history.replaceState(null, "", `/${hash}`);
}

describe("legacy route rules", () => {
  it("sends only #/meus and #/admin to the legacy page", () => {
    expect(routeSamples.filter(isLegacyRoute)).toEqual([
      "#/meus",
      "#/meus?tel=11912345678",
      "#/admin",
      "#/admin/agenda",
      "#/administrar",
    ]);
    expect(getLegacyPageUrl("#/meus")).toBe("/legado.html#/meus");
    expect(getLegacyPageUrl("#/admin")).toBe("/legado.html#/admin");
  });

  it("agrees with the legacy page's return script for every route, so they cannot loop", () => {
    const legacyKeeps = loadLegacyPageRule();
    for (const hash of routeSamples) {
      expect([hash, legacyKeeps(hash)]).toEqual([hash, isLegacyRoute(hash)]);
    }
  });

  it("maps legacy section links to React section ids", () => {
    expect(getLegacySectionId("#/#servicos")).toBe("servicos");
    expect(getLegacySectionId("#/#portfolio")).toBe("trabalhos");
    expect(getLegacySectionId("#/#local")).toBe("local");
    expect(getLegacySectionId("#/")).toBeNull();
    expect(getLegacySectionId("#servicos")).toBeNull();
    expect(getLegacySectionId("#/agendar")).toBeNull();
  });
});

describe("App legacy routing", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.storage;
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(legacyFixture));
    setHash("");
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    setHash("");
  });

  it.each(["#/meus", "#/admin"])("forwards an old %s bookmark to the legacy page", (hash) => {
    setHash(hash);
    const navigate = vi.fn();
    const { container } = render(<App navigate={navigate} />);

    expect(navigate).toHaveBeenCalledWith(`/legado.html${hash}`);
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).toBe("");
  });

  it("forwards when the hash changes to a legacy route", async () => {
    const navigate = vi.fn();
    render(<App navigate={navigate} />);
    await screen.findByRole("heading", { name: "O que a gente faz" });

    act(() => {
      setHash("#/admin");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });

    expect(navigate).toHaveBeenCalledWith("/legado.html#/admin");
  });

  it.each(["", "#/", "#/agendar", "#/agendar?s=s1", "#/#servicos"])("keeps %s in the React app", async (hash) => {
    setHash(hash);
    const navigate = vi.fn();
    render(<App navigate={navigate} />);

    await screen.findByRole("heading", {
      name: hash.startsWith("#/agendar") ? /O que você deseja fazer\?|Escolha uma data/ : "O que a gente faz",
    });
    expect(navigate).not.toHaveBeenCalled();
  });

  it("scrolls legacy section links to the matching React section", () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    setHash("#/#portfolio");
    render(<App navigate={vi.fn()} />);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect((scrollIntoView.mock.contexts[0] as Element).id).toBe("trabalhos");
  });

  it("links the footer directly to the legacy screens", async () => {
    render(<App navigate={vi.fn()} />);

    expect((await screen.findByRole("link", { name: "Meus agendamentos" })).getAttribute("href")).toBe("/legado.html#/meus");
    expect(screen.getByRole("link", { name: "Área do barbeiro" }).getAttribute("href")).toBe("/legado.html#/admin");
  });
});
