import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import {
  hasLegacyAdminSession,
  LEGACY_STORAGE_KEYS,
  readLegacyDatabase,
  readLegacyLastPhone,
  writeLegacyAdminSession,
  writeLegacyDatabase,
  writeLegacyLastPhone,
} from "@/lib/storage/legacy-storage";
import type { LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;

describe("legacy storage adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.storage;
  });

  afterEach(() => {
    delete window.storage;
    vi.restoreAllMocks();
  });

  it("reads the existing database JSON without transforming it", async () => {
    const serialized = JSON.stringify(fixture);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, serialized);

    const result = await readLegacyDatabase();

    expect(result).toEqual(fixture);
    expect(JSON.stringify(result)).toBe(serialized);
  });

  it("reads from window.storage first when it has a value", async () => {
    const get = vi.fn().mockResolvedValue({ value: JSON.stringify(fixture) });
    window.storage = { get, set: vi.fn() };
    const localGet = vi.spyOn(Storage.prototype, "getItem");

    const result = await readLegacyDatabase();

    expect(get).toHaveBeenCalledWith(LEGACY_STORAGE_KEYS.database);
    expect(result).toEqual(fixture);
    expect(localGet).not.toHaveBeenCalled();
  });

  it("writes the same database schema under the unchanged key", async () => {
    const serializedBeforeWrite = JSON.stringify(fixture);

    await writeLegacyDatabase(fixture);

    expect(LEGACY_STORAGE_KEYS.database).toBe("dhow_barber_db_v1");
    expect(window.localStorage.getItem("dhow_barber_db_v1")).toBe(serializedBeforeWrite);
    expect(JSON.parse(window.localStorage.getItem("dhow_barber_db_v1")!)).toEqual(fixture);
  });

  it("writes to window.storage before using localStorage", async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    window.storage = { get: vi.fn(), set };

    await writeLegacyDatabase(fixture);

    expect(set).toHaveBeenCalledWith(
      LEGACY_STORAGE_KEYS.database,
      JSON.stringify(fixture),
    );
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBeNull();
  });

  it("falls back to localStorage if window.storage access fails", async () => {
    const get = vi.fn().mockRejectedValue(new Error("storage unavailable"));
    window.storage = { get, set: vi.fn().mockRejectedValue(new Error("storage unavailable")) };
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));

    await expect(readLegacyDatabase()).resolves.toEqual(fixture);
    await writeLegacyDatabase(fixture);

    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe(JSON.stringify(fixture));
  });

  it("falls back to valid local data when window.storage contains invalid JSON", async () => {
    window.storage = {
      get: vi.fn().mockResolvedValue({ value: "{broken-json" }),
      set: vi.fn(),
    };
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(fixture));

    await expect(readLegacyDatabase()).resolves.toEqual(fixture);
    expect(window.storage.get).toHaveBeenCalledWith(LEGACY_STORAGE_KEYS.database);
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe(JSON.stringify(fixture));
  });

  it("preserves the legacy phone and admin session keys and values", () => {
    expect(LEGACY_STORAGE_KEYS.lastPhone).toBe("dhow_last_phone");
    expect(LEGACY_STORAGE_KEYS.adminSession).toBe("dhow_admin");

    writeLegacyLastPhone("11900000000");
    writeLegacyAdminSession(true);

    expect(readLegacyLastPhone()).toBe("11900000000");
    expect(hasLegacyAdminSession()).toBe(true);
    expect(window.localStorage.getItem("dhow_last_phone")).toBe("11900000000");
    expect(window.sessionStorage.getItem("dhow_admin")).toBe("1");

    writeLegacyAdminSession(false);
    expect(window.sessionStorage.getItem("dhow_admin")).toBeNull();
    expect(hasLegacyAdminSession()).toBe(false);
  });

  it("does not add versions, defaults, or rewrite unknown legacy fields", async () => {
    const original = JSON.stringify(fixture);
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, original);

    const loaded = await readLegacyDatabase();

    expect(JSON.stringify(loaded)).toBe(original);
    expect(loaded).not.toHaveProperty("dataVersion");
    expect(loaded).toHaveProperty("campoLegadoDesconhecido.manter", true);

    await writeLegacyDatabase(loaded!);

    const saved = window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)!;
    expect(saved).toBe(original);
    expect(JSON.parse(saved)).toEqual(fixture);
  });

  it("rejects malformed stored JSON instead of replacing it", async () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, "{broken-json");

    await expect(readLegacyDatabase()).rejects.toThrow("invalid JSON");
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe("{broken-json");
  });
});