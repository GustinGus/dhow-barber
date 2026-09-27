import { afterEach, beforeEach, describe, expect, it } from "vitest";
import legacyFixture from "@/../tests/fixtures/legacy-database.json";
import { createFreshLegacyDatabase, getLocalDateKey } from "@/features/booking/booking-domain";
import type { BookingDraft } from "@/features/booking/booking-types";
import { defaultPublicContent } from "@/features/public/public-content";
import { createLocalDataRepositories, dataRepositories, SlotUnavailableError } from "@/lib/data";
import { migrateLegacyDatabase } from "@/lib/storage/legacy-migration";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";
import type { LegacyAppointment, LegacyDatabase } from "@/types/legacy-database";

const fixture = legacyFixture as LegacyDatabase;
const LEGACY_APPOINTMENT_FIELDS = [
  "id", "codigo", "cliente", "telefone", "telDigits", "servicoId", "data", "hora",
  "duracao", "pagamento", "obs", "status", "criadoEm",
].sort();

function dayFromToday(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return getLocalDateKey(date);
}

/** Fixture with no block and its appointment in the past, so a future slot is always free. */
function bookableDatabase(): LegacyDatabase {
  const database = structuredClone(fixture);
  database.bloqueios = [];
  database.agendamentos[0] = { ...database.agendamentos[0], data: dayFromToday(-1) };
  return database;
}

function store(database: LegacyDatabase) {
  window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify(database));
}

function storedRaw(): string | null {
  return window.localStorage.getItem(LEGACY_STORAGE_KEYS.database);
}

function stored(): LegacyDatabase {
  return JSON.parse(storedRaw()!) as LegacyDatabase;
}

function draft(patch: Partial<BookingDraft> = {}): BookingDraft {
  return {
    servicoId: "s1",
    data: dayFromToday(10),
    hora: "10:00",
    pagamento: "PIX",
    nome: " Cliente Novo ",
    telefone: "(11) 91234-5678",
    obs: " Sem pressa ",
    ...patch,
  };
}

describe("local data repositories", () => {
  const repositories = createLocalDataRepositories();

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    delete window.storage;
  });

  afterEach(() => {
    delete window.storage;
  });

  it("is the data source the app uses", () => {
    expect(Object.keys(dataRepositories).sort()).toEqual(["booking", "clientAppointments", "clientDevice", "siteContent"]);
  });

  describe("reading", () => {
    it("reads an existing legacy database migrated in memory, without writing", async () => {
      store(fixture);
      const before = storedRaw();

      const snapshot = await repositories.booking.getSnapshot();

      expect(snapshot).toEqual(migrateLegacyDatabase(structuredClone(fixture)));
      expect(snapshot.dataVersion).toBe(2);
      expect(snapshot.agendamentos).toEqual(fixture.agendamentos);
      expect(snapshot.campoLegadoDesconhecido).toEqual({ manter: true });
      expect(await repositories.clientAppointments.getSnapshot()).toEqual(snapshot);
      expect(storedRaw()).toBe(before);
    });

    it("falls back to the seed when nothing is saved, without creating the database", async () => {
      expect(await repositories.booking.getSnapshot()).toEqual(createFreshLegacyDatabase());
      expect(await repositories.clientAppointments.getSnapshot()).toEqual(createFreshLegacyDatabase());
      expect(await repositories.siteContent.getSiteContent()).toEqual(defaultPublicContent);
      expect(storedRaw()).toBeNull();
    });

    it("builds the public content from the saved configuration, services and portfolio", async () => {
      const database = structuredClone(fixture);
      database.config.nome = "Dhow Barber Centro";
      database.servicos = [
        ...database.servicos,
        { id: "off", nome: "Desativado", desc: "", preco: 10, duracao: 30, ativo: false },
      ];
      database.portfolio = [...database.portfolio, { ...database.portfolio[0], id: "p-off", ativo: false }];
      store(database);
      const before = storedRaw();

      const content = await repositories.siteContent.getSiteContent();

      expect(content.config.nome).toBe("Dhow Barber Centro");
      expect(content.servicos.map((service) => service.id)).not.toContain("off");
      expect(content.portfolio.map((item) => item.id)).toEqual(["p1"]);
      expect(content.depoimentos).toEqual(fixture.depoimentos);
      expect(storedRaw()).toBe(before);
    });

    it("reads from window.storage when the legacy host provides it", async () => {
      const database = bookableDatabase();
      window.storage = {
        get: async () => ({ value: JSON.stringify(database) }),
        set: async () => undefined,
      };

      expect((await repositories.booking.getSnapshot()).agendamentos).toEqual(database.agendamentos);
    });

    it("propagates unreadable storage so the screens can show their error", async () => {
      window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, "{not json");

      await expect(repositories.booking.getSnapshot()).rejects.toThrow();
      await expect(repositories.siteContent.getSiteContent()).rejects.toThrow();
    });
  });

  describe("booking", () => {
    it("appends a pending DB-XXXX appointment in the legacy format and keeps everything else", async () => {
      const database = bookableDatabase();
      store(database);
      const snapshot = await repositories.booking.getSnapshot();

      const result = await repositories.booking.createAppointment(draft(), snapshot);

      const saved = stored();
      const created = saved.agendamentos.at(-1) as LegacyAppointment;
      expect(Object.keys(created).sort()).toEqual(LEGACY_APPOINTMENT_FIELDS);
      expect(created).toMatchObject({
        cliente: "Cliente Novo",
        telefone: "(11) 91234-5678",
        telDigits: "11912345678",
        servicoId: "s1",
        data: dayFromToday(10),
        hora: "10:00",
        duracao: 45,
        pagamento: "PIX",
        obs: "Sem pressa",
        status: "pendente",
      });
      expect(created.codigo).toMatch(/^DB-[A-Z0-9]{4}$/);
      expect(result.appointment).toEqual(created);
      expect(result.service.id).toBe("s1");
      expect(result.database).toEqual(saved);
      // Same whole-database format as before: migrated fixture plus exactly one appointment.
      expect(saved).toEqual({
        ...migrateLegacyDatabase(structuredClone(database)),
        agendamentos: [...database.agendamentos, created],
      });
    });

    it("finds the new appointment on the next read", async () => {
      store(bookableDatabase());
      const { appointment } = await repositories.booking.createAppointment(draft(), await repositories.booking.getSnapshot());

      const booking = await repositories.booking.getSnapshot();
      const client = await repositories.clientAppointments.getSnapshot();
      expect(booking.agendamentos).toContainEqual(appointment);
      expect(client.agendamentos.filter((item) => item.telDigits === "11912345678")).toEqual([appointment]);
    });

    it("rejects a slot taken since it was shown, without writing", async () => {
      const database = bookableDatabase();
      store(database);
      const snapshot = await repositories.booking.getSnapshot();
      const latest = structuredClone(database);
      latest.agendamentos.push({
        ...latest.agendamentos[0],
        id: "concurrent",
        data: dayFromToday(10),
        hora: "09:30",
        duracao: 60,
        status: "confirmado",
      });
      store(latest);
      const before = storedRaw();

      const attempt = repositories.booking.createAppointment(draft(), snapshot);

      await expect(attempt).rejects.toBeInstanceOf(SlotUnavailableError);
      await expect(attempt).rejects.toThrow("Esse horário acabou de ser ocupado. Escolha outro horário.");
      expect(storedRaw()).toBe(before);
    });

    it("rejects a service removed since it was shown, without writing", async () => {
      store(bookableDatabase());
      const snapshot = await repositories.booking.getSnapshot();
      const latest = bookableDatabase();
      latest.dataVersion = 2;
      latest.servicos = latest.servicos.filter((service) => service.id !== "s1");
      store(latest);
      const before = storedRaw();

      await expect(repositories.booking.createAppointment(draft(), snapshot)).rejects.toThrow("Este serviço não está mais disponível.");
      expect(storedRaw()).toBe(before);
    });

    it("saves on top of the screen's snapshot when the browser has nothing saved", async () => {
      const snapshot = await repositories.booking.getSnapshot();

      const { appointment } = await repositories.booking.createAppointment(draft({ servicoId: "s3" }), snapshot);

      expect(stored()).toEqual({ ...createFreshLegacyDatabase(), agendamentos: [appointment] });
      // No duration configured: the schedule interval is used, as before.
      expect(appointment.duracao).toBe(30);
    });

    it("writes through window.storage when the legacy host provides it", async () => {
      let remote = JSON.stringify(bookableDatabase());
      window.storage = {
        get: async () => ({ value: remote }),
        set: async (_key, value) => { remote = value; },
      };

      const { appointment } = await repositories.booking.createAppointment(draft(), await repositories.booking.getSnapshot());

      expect((JSON.parse(remote) as LegacyDatabase).agendamentos.at(-1)).toEqual(appointment);
      expect(storedRaw()).toBeNull();
    });
  });

  describe("client appointments", () => {
    function withClientAppointments(): LegacyDatabase {
      const database = bookableDatabase();
      database.agendamentos.push(
        { ...database.agendamentos[0], id: "open", codigo: "DB-OPEN", data: dayFromToday(3), status: "confirmado" },
        { ...database.agendamentos[0], id: "done", codigo: "DB-DONE", data: dayFromToday(-9), status: "concluido" },
      );
      store(database);
      return database;
    }

    it("cancels by changing only that appointment's status on the latest data", async () => {
      const database = withClientAppointments();
      // The barber changes another appointment after the screen loaded.
      const latest = structuredClone(database);
      latest.agendamentos[0] = { ...latest.agendamentos[0], status: "confirmado" };
      store(latest);

      const updated = await repositories.clientAppointments.cancelAppointment("open");

      const expected = migrateLegacyDatabase(structuredClone(latest));
      expected.agendamentos = latest.agendamentos.map((item) => item.id === "open" ? { ...item, status: "cancelado" } : item);
      expect(stored()).toEqual(expected);
      expect(updated).toEqual(expected);
    });

    it("refuses closed or missing appointments without writing", async () => {
      withClientAppointments();
      const before = storedRaw();

      await expect(repositories.clientAppointments.cancelAppointment("done")).rejects.toThrow("não pode mais ser cancelado");
      await expect(repositories.clientAppointments.cancelAppointment("missing")).rejects.toThrow("não foi encontrado");
      expect(storedRaw()).toBe(before);
    });

    it("refuses to cancel when nothing is saved, without creating the database", async () => {
      await expect(repositories.clientAppointments.cancelAppointment("open")).rejects.toThrow("Este agendamento não foi encontrado.");
      expect(storedRaw()).toBeNull();
    });
  });

  describe("client device", () => {
    it("remembers the phone in dhow_last_phone", () => {
      expect(repositories.clientDevice.getLastPhone()).toBe("");

      repositories.clientDevice.rememberPhone("11912345678");

      expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.lastPhone)).toBe("11912345678");
      expect(repositories.clientDevice.getLastPhone()).toBe("11912345678");
      expect(storedRaw()).toBeNull();
    });

    it("keeps working when the browser blocks storage", () => {
      const original = window.localStorage;
      const blocked = {
        getItem: () => { throw new Error("blocked"); },
        setItem: () => { throw new Error("blocked"); },
      };
      Object.defineProperty(window, "localStorage", { configurable: true, value: blocked });
      try {
        expect(repositories.clientDevice.getLastPhone()).toBe("");
        expect(() => repositories.clientDevice.rememberPhone("11912345678")).not.toThrow();
      } finally {
        Object.defineProperty(window, "localStorage", { configurable: true, value: original });
      }
    });
  });
});
