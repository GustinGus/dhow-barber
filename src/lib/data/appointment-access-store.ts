/**
 * Secret tokens the backend returns when this browser books (see create_appointment).
 * They prove the appointments belong to this device and are kept apart from the legacy
 * `dhow_barber_db_v1` database, under their own versioned key:
 *
 *   { "version": 1, "deviceToken": "<hex>", "appointments": { "DB-AB12CD": "<hex>" } }
 *
 * `deviceToken` is sent with the next bookings, so the backend links them all to this device.
 * `appointments` keeps the token of each code, so bookings made before a token change stay
 * reachable. The backend stores only a sha256 of each token.
 *
 * Tokens are secrets: never log them, put them in URLs or send them to analytics.
 */
export const APPOINTMENT_ACCESS_KEY = "dhow_appointment_access_v1";

const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

interface StoredAccess {
  version: 1;
  deviceToken: string | null;
  appointments: Record<string, string>;
}

export interface AppointmentAccessStore {
  /** Token to send with a new booking, or null before the first one. */
  getDeviceToken(): string | null;
  /** Token that proves access to a booking code, or null. */
  getToken(publicCode: string): string | null;
  /** Distinct tokens known on this device. */
  getTokens(): string[];
  /** Remembers the token returned for a booking. Invalid tokens are ignored. */
  save(publicCode: string, token: string): void;
}

type KeyValueStorage = Pick<Storage, "getItem" | "setItem">;

function emptyAccess(): StoredAccess {
  return { version: 1, deviceToken: null, appointments: {} };
}

function normalizeCode(publicCode: string): string {
  return publicCode.trim().toUpperCase();
}

function parse(serialized: string | null): StoredAccess {
  if (!serialized) return emptyAccess();
  try {
    const parsed = JSON.parse(serialized) as Partial<StoredAccess> | null;
    if (!parsed || parsed.version !== 1 || typeof parsed.appointments !== "object" || parsed.appointments === null) {
      return emptyAccess();
    }
    const appointments: Record<string, string> = {};
    for (const [code, token] of Object.entries(parsed.appointments)) {
      if (typeof token === "string" && TOKEN_PATTERN.test(token)) appointments[normalizeCode(code)] = token;
    }
    const deviceToken = typeof parsed.deviceToken === "string" && TOKEN_PATTERN.test(parsed.deviceToken)
      ? parsed.deviceToken
      : null;
    return { version: 1, deviceToken, appointments };
  } catch {
    return emptyAccess();
  }
}

/** Store backed by localStorage; unavailable storage behaves as empty and never throws. */
export function createAppointmentAccessStore(
  getStorage: () => KeyValueStorage = () => window.localStorage,
): AppointmentAccessStore {
  function read(): StoredAccess {
    try {
      return parse(getStorage().getItem(APPOINTMENT_ACCESS_KEY));
    } catch {
      return emptyAccess();
    }
  }

  return {
    getDeviceToken() {
      return read().deviceToken;
    },

    getToken(publicCode) {
      return read().appointments[normalizeCode(publicCode)] ?? null;
    },

    getTokens() {
      const access = read();
      return [...new Set([...(access.deviceToken ? [access.deviceToken] : []), ...Object.values(access.appointments)])];
    },

    save(publicCode, token) {
      if (!TOKEN_PATTERN.test(token) || !publicCode.trim()) return;
      const access = read();
      access.appointments[normalizeCode(publicCode)] = token;
      access.deviceToken = token;
      try {
        getStorage().setItem(APPOINTMENT_ACCESS_KEY, JSON.stringify(access));
      } catch {
        // Storage can be blocked; the booking itself is already saved on the server.
      }
    },
  };
}
