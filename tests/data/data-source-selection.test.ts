import { afterEach, describe, expect, it, vi } from "vitest";
import type { BookingDraft } from "@/features/booking/booking-types";
import { dataRepositories, selectDataRepositories } from "@/lib/data";
import { resolveDataSource } from "@/lib/data/data-source";
import { createLazySupabaseDataRepositories } from "@/lib/data/lazy-supabase-repository";
import type { SupabaseDataRepositories } from "@/lib/data/supabase-repository";
import { SupabaseNotConfiguredError } from "@/lib/supabase/config";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";
import type { LegacyDatabase } from "@/types/legacy-database";

const URL = "https://example.supabase.co";
const KEY = "public-anon-key";

describe("data source selection", () => {
  it("without variables → local", () => {
    expect(resolveDataSource({})).toBe("local");
  });

  it("VITE_DATA_SOURCE=local → local, even with Supabase settings", () => {
    expect(resolveDataSource({ VITE_DATA_SOURCE: "local" })).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "local", VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY })).toBe("local");
  });

  it("VITE_DATA_SOURCE=supabase with URL and key → supabase", () => {
    expect(resolveDataSource({ VITE_DATA_SOURCE: "supabase", VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY })).toBe("supabase");
    expect(resolveDataSource({ VITE_DATA_SOURCE: " supabase ", VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY })).toBe("supabase");
  });

  it("incomplete Supabase settings fall back to local", () => {
    expect(resolveDataSource({ VITE_DATA_SOURCE: "supabase" })).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "supabase", VITE_SUPABASE_URL: URL })).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "supabase", VITE_SUPABASE_ANON_KEY: KEY })).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "supabase", VITE_SUPABASE_URL: " ", VITE_SUPABASE_ANON_KEY: KEY })).toBe("local");
  });

  it("unknown values fall back to local", () => {
    expect(resolveDataSource({ VITE_DATA_SOURCE: "SUPABASE", VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY })).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "remote", VITE_SUPABASE_URL: URL, VITE_SUPABASE_ANON_KEY: KEY })).toBe("local");
  });
});

describe("selected repositories", () => {
  afterEach(() => window.localStorage.clear());

  it("this build (no Supabase variables) uses the browser storage", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify({ config: { nome: "Do navegador" } }));
    expect((await dataRepositories.siteContent.getSiteContent()).config.nome).toBe("Do navegador");
    expect((await selectDataRepositories("local").siteContent.getSiteContent()).config.nome).toBe("Do navegador");
  });

  it("the supabase selection loads remote code only when used, and stays safe without settings", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify({ config: { nome: "Do navegador" } }));
    const repositories = selectDataRepositories("supabase");

    // No settings in this test build: the real lazy path fails clearly instead of reading local data.
    await expect(repositories.siteContent.getSiteContent()).rejects.toBeInstanceOf(SupabaseNotConfiguredError);
    repositories.clientDevice.rememberPhone("11912345678");
    expect(repositories.clientDevice.getLastPhone()).toBe("11912345678");
  });
});

describe("lazy Supabase repositories", () => {
  const snapshot = { agendamentos: [] } as unknown as LegacyDatabase;

  function fakeRemote() {
    return {
      siteContent: { getSiteContent: vi.fn(async () => ({ config: { nome: "Remoto" } })) },
      booking: {
        getSnapshot: vi.fn(async () => snapshot),
        createAppointment: vi.fn(async () => ({ database: snapshot, appointment: { id: "a" }, service: { id: "s1" } })),
      },
      clientAppointments: {
        getSnapshot: vi.fn(async () => snapshot),
        cancelAppointment: vi.fn(async () => snapshot),
      },
    } as unknown as SupabaseDataRepositories;
  }

  it("does not load until a repository is used, then loads once", async () => {
    const remote = fakeRemote();
    const load = vi.fn(async () => remote);
    const repositories = createLazySupabaseDataRepositories(load);
    expect(load).not.toHaveBeenCalled();

    await repositories.siteContent.getSiteContent();
    await repositories.booking.getSnapshot();
    await repositories.clientAppointments.getSnapshot();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("forwards every call and its arguments to the Supabase repositories", async () => {
    const remote = fakeRemote();
    const repositories = createLazySupabaseDataRepositories(async () => remote);
    const draft = { servicoId: "s1" } as BookingDraft;

    expect((await repositories.siteContent.getSiteContent()).config.nome).toBe("Remoto");
    await repositories.booking.createAppointment(draft, snapshot);
    await repositories.clientAppointments.cancelAppointment("DB-AB12CD");
    expect(remote.booking.createAppointment).toHaveBeenCalledWith(draft, snapshot);
    expect(remote.clientAppointments.cancelAppointment).toHaveBeenCalledWith("DB-AB12CD");
  });

  it("retries the load after a failure", async () => {
    const remote = fakeRemote();
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("rede indisponível"))
      .mockResolvedValue(remote);
    const repositories = createLazySupabaseDataRepositories(load);

    await expect(repositories.booking.getSnapshot()).rejects.toThrow("rede indisponível");
    await expect(repositories.booking.getSnapshot()).resolves.toBe(snapshot);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
