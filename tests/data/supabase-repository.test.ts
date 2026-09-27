import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAvailableSlots } from "@/features/booking/booking-domain";
import type { BookingDraft } from "@/features/booking/booking-types";
import { defaultPublicContent } from "@/features/public/public-content";
import { APPOINTMENT_ACCESS_KEY, createAppointmentAccessStore } from "@/lib/data/appointment-access-store";
import { dataRepositories, SlotUnavailableError } from "@/lib/data";
import { resolveDataSource } from "@/lib/data/data-source";
import { createSupabaseDataRepositories, RemoteDataError } from "@/lib/data/supabase-repository";
import { type DhowSupabaseClient, getSupabaseClient } from "@/lib/supabase/client";
import { readSupabaseConfig, SupabaseNotConfiguredError } from "@/lib/supabase/config";
import { LEGACY_STORAGE_KEYS } from "@/lib/storage/legacy-storage";

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);
const SERVICE_UUID = "11111111-1111-1111-1111-111111111111";

interface RecordedQuery {
  table: string;
  columns?: string;
  filters: unknown[][];
  orders: string[];
}

type RpcResult = { data: unknown; error: { message: string } | null };

/** In-memory stand-in for the Supabase client: records every query and RPC call. */
function fakeSupabase(tables: Record<string, unknown>, rpcs: Record<string, (args: Record<string, unknown>) => RpcResult> = {}) {
  const queries: RecordedQuery[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    from(table: string) {
      const query: RecordedQuery = { table, filters: [], orders: [] };
      queries.push(query);
      const value = tables[table];
      const error = value instanceof Error ? { message: value.message } : null;
      const rows = error ? null : value ?? [];
      const builder = {
        select(columns: string) { query.columns = columns; return builder; },
        eq(...args: unknown[]) { query.filters.push(["eq", ...args]); return builder; },
        gte(...args: unknown[]) { query.filters.push(["gte", ...args]); return builder; },
        order(column: string) { query.orders.push(column); return builder; },
        maybeSingle() {
          return Promise.resolve({ data: Array.isArray(rows) ? rows[0] ?? null : rows, error });
        },
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve({ data: rows, error }).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      const handler = rpcs[name];
      return Promise.resolve(handler ? handler(args) : { data: null, error: { message: `NOT_MOCKED:${name}` } });
    },
  };
  return { client: client as unknown as DhowSupabaseClient, queries, rpcCalls };
}

const settingsRow = {
  name: "Dhow Barber", address_line: "Rua A, 1", neighborhood: "Centro", city: "Jundiaí - SP",
  postal_code: "13200-000", phone_display: "(11) 94146-5958", phone_e164: "+5511941465958",
  whatsapp_number: "5511941465958", instagram_url: "https://instagram.com/dhow", booking_channel: "whatsapp",
  booking_channel_url: "", rating_display: "4,9", review_count: 50, free_schedule: false,
  free_start: "08:00:00", free_end: "20:00:00", schedule_configured: true, slot_interval_minutes: 30,
  lunch_enabled: true, lunch_start: "12:00:00", lunch_end: "13:00:00",
};

const serviceRows = [
  { id: SERVICE_UUID, legacy_id: "s1", name: "Corte de cabelo", description: "", price_cents: 4000, price_label: null, duration_minutes: 45, active: true },
  { id: "22222222-2222-2222-2222-222222222222", legacy_id: null, name: "Coloração", description: "Tinta", price_cents: null, price_label: "Verificar com o Dhow", duration_minutes: null, active: true },
];

const hoursRows = Array.from({ length: 7 }, (_, weekday) => ({
  weekday, is_open: weekday >= 1 && weekday <= 5, open_time: "09:00:00", close_time: "18:00:00",
}));

function clientRow(patch: Record<string, unknown> = {}) {
  return {
    public_code: "DB-AB12CD", service_name: "Corte de cabelo", appointment_date: "2030-01-10",
    start_time: "10:00:00", end_time: "10:45:00", status: "pendente", payment_method: "PIX", notes: "",
    customer_name: "Cliente Fiel", customer_phone: "+55 (11) 91234-5678", price_cents: 4000, price_label: null,
    ...patch,
  };
}

function draft(patch: Partial<BookingDraft> = {}): BookingDraft {
  return {
    servicoId: "s1", data: "2030-01-10", hora: "10:00", pagamento: "PIX",
    nome: " Cliente Novo ", telefone: " (11) 91234-5678 ", obs: " Sem pressa ", ...patch,
  };
}

const fixedNow = () => new Date(2030, 0, 10, 8, 0);

describe("Supabase configuration", () => {
  it("is optional: without env the app has no Supabase settings and stays local", () => {
    expect(readSupabaseConfig({})).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: " ", VITE_SUPABASE_ANON_KEY: "key" })).toBeNull();
    expect(readSupabaseConfig({ VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" }))
      .toEqual({ url: "https://x.supabase.co", anonKey: "anon" });
    expect(() => getSupabaseClient(null)).toThrow(SupabaseNotConfiguredError);
  });

  it("keeps the local repository as the default data source", () => {
    expect(resolveDataSource({})).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "supabase" })).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "local", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" })).toBe("local");
    expect(resolveDataSource({ VITE_DATA_SOURCE: "supabase", VITE_SUPABASE_URL: "https://x.supabase.co", VITE_SUPABASE_ANON_KEY: "anon" })).toBe("supabase");
  });

  it("the app's repositories still read the browser storage", async () => {
    window.localStorage.clear();
    window.localStorage.setItem(LEGACY_STORAGE_KEYS.database, JSON.stringify({ config: { nome: "Salvo no navegador" } }));
    expect((await dataRepositories.siteContent.getSiteContent()).config.nome).toBe("Salvo no navegador");
    window.localStorage.clear();
  });

  it("does not create the client until a method needs it", async () => {
    const factory = vi.fn(() => fakeSupabase({ reviews: [{ body: "Ótimo" }] }).client);
    const repositories = createSupabaseDataRepositories({ client: factory });
    expect(factory).not.toHaveBeenCalled();
    await repositories.siteContent.getSiteContent();
    expect(factory).toHaveBeenCalled();
  });
});

describe("Supabase repositories", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("maps public content: settings, active services, portfolio and reviews", async () => {
    const { client, queries } = fakeSupabase({
      business_settings: [settingsRow],
      services: serviceRows,
      portfolio: [{ id: "uuid-p", legacy_id: "p1", image_url: "https://cdn/p1.jpg", caption: "Degradê", instagram_url: "https://ig/p1", active: true }],
      reviews: [{ body: "Muito bom" }],
    });

    const content = await createSupabaseDataRepositories({ client }).siteContent.getSiteContent();

    expect(content.config).toEqual({
      nome: "Dhow Barber", endereco: "Rua A, 1", bairro: "Centro", cidade: "Jundiaí - SP", cep: "13200-000",
      telefone: "(11) 94146-5958", telefoneRaw: "+5511941465958", whatsapp: "5511941465958",
      instagram: "https://instagram.com/dhow", nota: "4,9", avaliacoes: 50,
    });
    expect(content.servicos).toEqual([
      { id: "s1", remoteId: SERVICE_UUID, nome: "Corte de cabelo", desc: "", preco: 40, duracao: 45, ativo: true },
      { id: "22222222-2222-2222-2222-222222222222", remoteId: "22222222-2222-2222-2222-222222222222", nome: "Coloração", desc: "Tinta", preco: "Verificar com o Dhow", duracao: null, ativo: true },
    ]);
    expect(content.portfolio).toEqual([{ id: "p1", image: "https://cdn/p1.jpg", caption: "Degradê", instagramUrl: "https://ig/p1", ativo: true }]);
    expect(content.depoimentos).toEqual(["Muito bom"]);
    expect(queries.find((query) => query.table === "portfolio")?.filters).toContainEqual(["eq", "active", true]);
    expect(queries.find((query) => query.table === "reviews")?.filters).toContainEqual(["eq", "active", true]);
  });

  it("falls back to the default public content when the database is empty", async () => {
    const { client } = fakeSupabase({ business_settings: [], services: [], portfolio: [], reviews: [] });
    const content = await createSupabaseDataRepositories({ client }).siteContent.getSiteContent();
    expect(content.config).toEqual(defaultPublicContent.config);
    expect(content.depoimentos).toEqual(defaultPublicContent.depoimentos);
  });

  it("builds the booking snapshot: hours, public block columns and busy intervals as occupied time", async () => {
    const { client, queries, rpcCalls } = fakeSupabase(
      {
        business_settings: [settingsRow],
        services: serviceRows,
        business_hours: hoursRows,
        blocked_dates: [{ id: "b1", start_date: "2030-01-11", end_date: "2030-01-11", all_day: true, start_time: "12:00:00", end_time: "13:00:00" }],
      },
      {
        get_busy_intervals: (args) => ({
          data: args.p_date === "2030-01-10" ? [{ start_time: "10:00:00", end_time: "10:45:00" }] : [],
          error: null,
        }),
      },
    );

    const snapshot = await createSupabaseDataRepositories({ client, now: fixedNow, busyHorizonDays: 3 }).booking.getSnapshot();

    expect(snapshot.config.senha).toBe("");
    expect(snapshot.horarios).toMatchObject({
      livre: false, configurado: true, intervalo: 30, livreIni: "08:00", livreFim: "20:00",
      almoco: { ativo: true, ini: "12:00", fim: "13:00" },
    });
    expect(snapshot.horarios.dias[0]).toEqual({ aberto: false, ini: "09:00", fim: "18:00" });
    expect(snapshot.horarios.dias[4]).toEqual({ aberto: true, ini: "09:00", fim: "18:00" });
    expect(snapshot.bloqueios).toEqual([{ id: "b1", dataIni: "2030-01-11", dataFim: "2030-01-11", diaTodo: true, ini: "12:00", fim: "13:00", motivo: "" }]);
    const blockQuery = queries.find((query) => query.table === "blocked_dates")!;
    expect(blockQuery.columns).not.toContain("reason");
    expect(blockQuery.filters).toContainEqual(["gte", "end_date", "2030-01-10"]);
    expect(rpcCalls.map((call) => call.args.p_date)).toEqual(["2030-01-10", "2030-01-11", "2030-01-12"]);
    expect(snapshot.agendamentos).toEqual([expect.objectContaining({
      data: "2030-01-10", hora: "10:00", duracao: 45, status: "confirmado", cliente: "", telefone: "",
    })]);
    // Availability rules work unchanged on the remote snapshot.
    const slots = getAvailableSlots(snapshot, "2030-01-10", 30, fixedNow());
    expect(slots).not.toContain("10:00");
    expect(slots).not.toContain("10:30");
    expect(slots).toContain("09:00");
    expect(slots).toContain("11:00");
    expect(slots).not.toContain("12:00");
  });

  it("creates the booking through the RPC and keeps the access token apart from the legacy database", async () => {
    const created = {
      id: "33333333-3333-3333-3333-333333333333", public_code: "DB-AB12CD", device_token: TOKEN_A,
      service_name: "Corte de cabelo", appointment_date: "2030-01-10", start_time: "10:00", end_time: "10:45", status: "pendente",
    };
    const { client, rpcCalls } = fakeSupabase({}, { create_appointment: () => ({ data: created, error: null }) });
    const repositories = createSupabaseDataRepositories({ client, now: fixedNow });
    const snapshot = { ...(await createSupabaseDataRepositories({ client: fakeSupabase({ services: serviceRows }, { get_busy_intervals: () => ({ data: [], error: null }) }).client, busyHorizonDays: 1 }).booking.getSnapshot()) };

    const result = await repositories.booking.createAppointment(draft(), snapshot);

    expect(rpcCalls).toEqual([{ name: "create_appointment", args: {
      p_service_id: SERVICE_UUID, p_date: "2030-01-10", p_start_time: "10:00", p_customer_name: "Cliente Novo",
      p_customer_phone: "(11) 91234-5678", p_payment_method: "PIX", p_notes: "Sem pressa", p_device_token: undefined,
    } }]);
    expect(result.appointment).toEqual({
      id: created.id, codigo: "DB-AB12CD", cliente: "Cliente Novo", telefone: "(11) 91234-5678", telDigits: "11912345678",
      servicoId: "s1", data: "2030-01-10", hora: "10:00", duracao: 45, pagamento: "PIX", obs: "Sem pressa",
      status: "pendente", criadoEm: fixedNow().toISOString(),
    });
    expect(result.service.id).toBe("s1");
    expect(result.database.agendamentos.at(-1)).toEqual(result.appointment);
    expect(JSON.parse(window.localStorage.getItem(APPOINTMENT_ACCESS_KEY)!)).toEqual({
      version: 1, deviceToken: TOKEN_A, appointments: { "DB-AB12CD": TOKEN_A },
    });
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEYS.database)).toBeNull();
    expect(JSON.stringify(result)).not.toContain(TOKEN_A);

    // The next booking from this browser reuses the device token.
    await repositories.booking.createAppointment(draft({ hora: "11:00" }), snapshot);
    expect(rpcCalls[1].args.p_device_token).toBe(TOKEN_A);
  });

  it("turns a double booking rejected by the database into SlotUnavailableError", async () => {
    const snapshotClient = fakeSupabase({ services: serviceRows }, { get_busy_intervals: () => ({ data: [], error: null }) }).client;
    const snapshot = await createSupabaseDataRepositories({ client: snapshotClient, busyHorizonDays: 1 }).booking.getSnapshot();

    for (const code of ["SLOT_TAKEN", "SLOT_UNAVAILABLE"]) {
      const { client } = fakeSupabase({}, { create_appointment: () => ({ data: null, error: { message: code } }) });
      const attempt = createSupabaseDataRepositories({ client }).booking.createAppointment(draft(), snapshot);
      await expect(attempt).rejects.toBeInstanceOf(SlotUnavailableError);
      await expect(attempt).rejects.toThrow("Esse horário acabou de ser ocupado. Escolha outro horário.");
    }
    expect(window.localStorage.getItem(APPOINTMENT_ACCESS_KEY)).toBeNull();
  });

  it("maps other RPC errors to readable messages without leaking details", async () => {
    const snapshotClient = fakeSupabase({ services: serviceRows }, { get_busy_intervals: () => ({ data: [], error: null }) }).client;
    const snapshot = await createSupabaseDataRepositories({ client: snapshotClient, busyHorizonDays: 1 }).booking.getSnapshot();
    const create = (message: string) => createSupabaseDataRepositories({
      client: fakeSupabase({}, { create_appointment: () => ({ data: null, error: { message } }) }).client,
    }).booking.createAppointment(draft(), snapshot);

    await expect(create("SERVICE_UNAVAILABLE")).rejects.toThrow("Este serviço não está mais disponível.");
    await expect(create("INVALID_CUSTOMER")).rejects.toThrow("Confira o nome e o telefone com DDD.");
    const unknown = create('relation "x" does not exist');
    await expect(unknown).rejects.toBeInstanceOf(RemoteDataError);
    await expect(unknown).rejects.toThrow("Não foi possível falar com o servidor. Tente novamente.");
    await expect(createSupabaseDataRepositories({ client: fakeSupabase({}).client }).booking.createAppointment(draft({ servicoId: "desconhecido" }), snapshot))
      .rejects.toThrow("Este serviço não está mais disponível.");
  });

  it("reads the client's appointments only with the tokens stored on this device", async () => {
    const store = createAppointmentAccessStore();
    store.save("DB-AB12CD", TOKEN_A);
    store.save("DB-ZX98YW", TOKEN_B);
    const { client, rpcCalls } = fakeSupabase({}, {
      get_client_appointments: (args) => ({
        data: args.p_device_token === TOKEN_A
          ? [clientRow()]
          : [clientRow({ public_code: "DB-ZX98YW", status: "cancelado", service_name: "Barba", price_cents: null, price_label: "Consulte" })],
        error: null,
      }),
    });

    const snapshot = await createSupabaseDataRepositories({ client }).clientAppointments.getSnapshot();

    expect(rpcCalls.map((call) => call.name)).toEqual(["get_client_appointments", "get_client_appointments"]);
    expect(new Set(rpcCalls.map((call) => call.args.p_device_token))).toEqual(new Set([TOKEN_A, TOKEN_B]));
    expect(snapshot.agendamentos).toEqual([
      expect.objectContaining({ id: "DB-AB12CD", codigo: "DB-AB12CD", telDigits: "11912345678", hora: "10:00", duracao: 45, status: "pendente" }),
      expect.objectContaining({ id: "DB-ZX98YW", status: "cancelado" }),
    ]);
    // Name and price copied at booking time, never offered for new bookings.
    expect(snapshot.servicos).toEqual([
      { id: "booking:DB-AB12CD", nome: "Corte de cabelo", desc: "", preco: 40, duracao: null, ativo: false },
      { id: "booking:DB-ZX98YW", nome: "Barba", desc: "", preco: "Consulte", duracao: null, ativo: false },
    ]);
  });

  it("does not call the server when this device has no token", async () => {
    const { client, rpcCalls } = fakeSupabase({});
    const snapshot = await createSupabaseDataRepositories({ client }).clientAppointments.getSnapshot();
    expect(snapshot.agendamentos).toEqual([]);
    expect(rpcCalls).toEqual([]);
  });

  it("cancels with the device token and refreshes the list", async () => {
    createAppointmentAccessStore().save("DB-AB12CD", TOKEN_A);
    let status = "pendente";
    const { client, rpcCalls } = fakeSupabase({}, {
      cancel_client_appointment: () => { status = "cancelado"; return { data: { ok: true, status }, error: null }; },
      get_client_appointments: () => ({ data: [clientRow({ status })], error: null }),
    });

    const updated = await createSupabaseDataRepositories({ client }).clientAppointments.cancelAppointment("DB-AB12CD");

    expect(rpcCalls[0]).toEqual({ name: "cancel_client_appointment", args: { p_public_code: "DB-AB12CD", p_device_token: TOKEN_A } });
    expect(updated.agendamentos[0].status).toBe("cancelado");
  });

  it("reports cancellations the database refuses", async () => {
    createAppointmentAccessStore().save("DB-AB12CD", TOKEN_A);
    const refuse = (error: string) => createSupabaseDataRepositories({
      client: fakeSupabase({}, { cancel_client_appointment: () => ({ data: { ok: false, error }, error: null }) }).client,
    }).clientAppointments.cancelAppointment("DB-AB12CD");

    await expect(refuse("NOT_CANCELLABLE")).rejects.toThrow("Este agendamento não pode mais ser cancelado.");
    await expect(refuse("APPOINTMENT_NOT_FOUND")).rejects.toThrow("Este agendamento não foi encontrado.");
    const { client, rpcCalls } = fakeSupabase({});
    await expect(createSupabaseDataRepositories({ client }).clientAppointments.cancelAppointment("DB-SEMTOKEN"))
      .rejects.toThrow("Este agendamento não foi encontrado.");
    expect(rpcCalls).toEqual([]);
  });

  it("looks up and cancels on another device with phone + code", async () => {
    const { client, rpcCalls } = fakeSupabase({}, {
      get_client_appointment_by_code: () => ({ data: [clientRow()], error: null }),
      cancel_client_appointment: () => ({ data: { ok: true }, error: null }),
    });
    const repositories = createSupabaseDataRepositories({ client });

    const found = await repositories.clientAppointments.findByCode("(11) 91234-5678", "DB-AB12CD");
    await repositories.clientAppointments.cancelWithPhone("DB-AB12CD", "(11) 91234-5678");

    expect(found.agendamentos.map((item) => item.codigo)).toEqual(["DB-AB12CD"]);
    expect(rpcCalls).toEqual([
      { name: "get_client_appointment_by_code", args: { p_customer_phone: "(11) 91234-5678", p_public_code: "DB-AB12CD" } },
      { name: "cancel_client_appointment", args: { p_public_code: "DB-AB12CD", p_customer_phone: "(11) 91234-5678" } },
    ]);
    const throttled = createSupabaseDataRepositories({
      client: fakeSupabase({}, { get_client_appointment_by_code: () => ({ data: null, error: { message: "TOO_MANY_ATTEMPTS" } }) }).client,
    }).clientAppointments.findByCode("11912345678", "DB-XXXXXX");
    await expect(throttled).rejects.toThrow("Muitas tentativas. Tente novamente mais tarde.");
  });

  it("propagates query failures as a generic server error", async () => {
    const { client } = fakeSupabase({ business_settings: new Error("permission denied for table business_settings") });
    await expect(createSupabaseDataRepositories({ client }).siteContent.getSiteContent())
      .rejects.toThrow("Não foi possível falar com o servidor. Tente novamente.");
  });
});
