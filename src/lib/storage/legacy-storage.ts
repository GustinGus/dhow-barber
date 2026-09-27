import type { LegacyDatabase } from "@/types/legacy-database";

export const LEGACY_STORAGE_KEYS = {
  database: "dhow_barber_db_v1",
  lastPhone: "dhow_last_phone",
  adminSession: "dhow_admin",
} as const;

export interface LegacyWindowStorage {
  get(key: string): Promise<{ value?: string } | null>;
  set(key: string, value: string): Promise<unknown>;
}

declare global {
  interface Window {
    storage?: LegacyWindowStorage;
  }
}

export class LegacyStorageDataError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LegacyStorageDataError";
  }
}

function parseDatabase(serialized: string): LegacyDatabase {
  let parsed: unknown;

  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    throw new LegacyStorageDataError("Legacy database contains invalid JSON.", {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new LegacyStorageDataError("Legacy database must be a JSON object.");
  }

  return parsed as LegacyDatabase;
}

export async function readLegacyDatabase(): Promise<LegacyDatabase | null> {
  let storedValue: string | undefined;
  let remoteDataError: LegacyStorageDataError | undefined;

  if (window.storage) {
    try {
      storedValue = (await window.storage.get(LEGACY_STORAGE_KEYS.database))?.value;
    } catch {
      storedValue = undefined;
    }
  }

  if (storedValue) {
    try {
      return parseDatabase(storedValue);
    } catch (error) {
      if (!(error instanceof LegacyStorageDataError)) {
        throw error;
      }
      remoteDataError = error;
    }
  }

  const localValue = window.localStorage.getItem(LEGACY_STORAGE_KEYS.database);
  if (localValue) {
    return parseDatabase(localValue);
  }

  if (remoteDataError) {
    throw remoteDataError;
  }

  return null;
}

export async function writeLegacyDatabase(database: LegacyDatabase): Promise<void> {
  const serialized = JSON.stringify(database);

  if (window.storage) {
    try {
      await window.storage.set(LEGACY_STORAGE_KEYS.database, serialized);
      return;
    } catch {
      window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, serialized);
      return;
    }
  }

  window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, serialized);
}

export function readLegacyLastPhone(): string {
  return window.localStorage.getItem(LEGACY_STORAGE_KEYS.lastPhone) ?? "";
}

export function writeLegacyLastPhone(phoneDigits: string): void {
  window.localStorage.setItem(LEGACY_STORAGE_KEYS.lastPhone, phoneDigits);
}

export function hasLegacyAdminSession(): boolean {
  return window.sessionStorage.getItem(LEGACY_STORAGE_KEYS.adminSession) === "1";
}

export function writeLegacyAdminSession(authenticated: boolean): void {
  if (authenticated) {
    window.sessionStorage.setItem(LEGACY_STORAGE_KEYS.adminSession, "1");
    return;
  }

  window.sessionStorage.removeItem(LEGACY_STORAGE_KEYS.adminSession);
}