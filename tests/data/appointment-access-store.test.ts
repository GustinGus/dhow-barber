import { beforeEach, describe, expect, it, vi } from "vitest";
import { APPOINTMENT_ACCESS_KEY, createAppointmentAccessStore } from "@/lib/data/appointment-access-store";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

describe("appointment access store", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts empty", () => {
    const store = createAppointmentAccessStore();
    expect(store.getDeviceToken()).toBeNull();
    expect(store.getTokens()).toEqual([]);
    expect(store.getToken("DB-AB12CD")).toBeNull();
  });

  it("keeps tokens under its own versioned key, never in the legacy database", () => {
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, '{"agendamentos":[]}');
    const store = createAppointmentAccessStore();

    store.save(" db-ab12cd ", TOKEN_A);

    expect(JSON.parse(window.localStorage.getItem(APPOINTMENT_ACCESS_KEY)!)).toEqual({
      version: 1, deviceToken: TOKEN_A, appointments: { "DB-AB12CD": TOKEN_A },
    });
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBe('{"agendamentos":[]}');
    expect(store.getToken("DB-AB12CD")).toBe(TOKEN_A);
  });

  it("keeps older tokens reachable when the device token changes", () => {
    const store = createAppointmentAccessStore();
    store.save("DB-AAAAAA", TOKEN_A);
    store.save("DB-BBBBBB", TOKEN_B);

    expect(store.getDeviceToken()).toBe(TOKEN_B);
    expect(store.getToken("DB-AAAAAA")).toBe(TOKEN_A);
    expect(store.getTokens().sort()).toEqual([TOKEN_A, TOKEN_B]);
  });

  it("ignores invalid tokens and corrupted storage", () => {
    const store = createAppointmentAccessStore();
    store.save("DB-AAAAAA", "not-a-token");
    expect(window.localStorage.getItem(APPOINTMENT_ACCESS_KEY)).toBeNull();

    window.localStorage.setItem(APPOINTMENT_ACCESS_KEY, "{broken");
    expect(store.getTokens()).toEqual([]);

    window.localStorage.setItem(APPOINTMENT_ACCESS_KEY, JSON.stringify({ version: 1, deviceToken: "x", appointments: { "DB-1": "y", "DB-2": TOKEN_A } }));
    expect(store.getDeviceToken()).toBeNull();
    expect(store.getTokens()).toEqual([TOKEN_A]);
  });

  it("never throws or logs when storage is blocked", () => {
    const log = vi.spyOn(console, "log");
    const error = vi.spyOn(console, "error");
    const blocked = () => ({
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    });
    const store = createAppointmentAccessStore(blocked);

    expect(() => store.save("DB-AAAAAA", TOKEN_A)).not.toThrow();
    expect(store.getTokens()).toEqual([]);
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});
