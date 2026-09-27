import { createFreshLegacyDatabase, getLocalDateKey, getService } from "@/features/booking/booking-domain";
import { defaultPublicContent } from "@/features/public/public-content";
import type { DhowSupabaseClient } from "@/lib/supabase/client";
import type { LegacyAppointment } from "@/types/legacy-database";
import { type AppointmentAccessStore, createAppointmentAccessStore } from "./appointment-access-store";
import { createLocalDataRepositories } from "./local-repository";
import {
  BLOCKED_DATE_COLUMNS,
  type BlockedDateRow,
  BUSINESS_HOURS_COLUMNS,
  type BusinessHoursRow,
  type BusyIntervalRow,
  type ClientAppointmentRow,
  minutesBetween,
  normalizePhoneDigits,
  PORTFOLIO_COLUMNS,
  type PortfolioRow,
  type RemoteLegacyService,
  type ReviewRow,
  SERVICE_COLUMNS,
  type ServiceRow,
  SETTINGS_COLUMNS,
  type SettingsRow,
  toClientAppointment,
  toCreatedAppointment,
  toLegacyBlock,
  toLegacyConfig,
  toLegacyHours,
  toLegacyPortfolioItem,
  toLegacyService,
  toOccupiedAppointment,
} from "./supabase-mappers";
import {
  type ClientAppointmentsRepository,
  type ClientDeviceStore,
  type DataRepositories,
  type DataSnapshot,
  SlotUnavailableError,
} from "./types";

/** Error from the database with its stable code (e.g. SLOT_TAKEN, NOT_CANCELLABLE). */
export class RemoteDataError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RemoteDataError";
  }
}

const ERROR_MESSAGES: Record<string, string> = {
  SERVICE_UNAVAILABLE: "Este serviço não está mais disponível.",
  INVALID_CUSTOMER: "Confira o nome e o telefone com DDD.",
  INVALID_PAYMENT: "Escolha como pretende pagar.",
  TOO_MANY_ACTIVE_BOOKINGS: "Este telefone já tem agendamentos em aberto. Fale com a barbearia.",
  APPOINTMENT_NOT_FOUND: "Este agendamento não foi encontrado.",
  NOT_CANCELLABLE: "Este agendamento não pode mais ser cancelado.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas. Tente novamente mais tarde.",
};
const GENERIC_ERROR = "Não foi possível falar com o servidor. Tente novamente.";

/** Turns a database error code into the error the screens already understand. */
export function toRemoteError(code: string | undefined): Error {
  if (code === "SLOT_TAKEN" || code === "SLOT_UNAVAILABLE") return new SlotUnavailableError();
  const known = code && ERROR_MESSAGES[code];
  return new RemoteDataError(known ? code : "UNKNOWN", known || GENERIC_ERROR);
}

interface QueryResult<T> {
  data: T | null;
  error: { message: string } | null;
}

async function unwrap<T>(query: PromiseLike<QueryResult<T>>): Promise<T> {
  const { data, error } = await query;
  // Only the error code/message from Postgres is used; request data (tokens, phones) is never logged.
  if (error) throw toRemoteError(error.message);
  return data as T;
}

/** Client appointments with the lookups the local repository does not need. */
export interface SupabaseClientAppointmentsRepository extends ClientAppointmentsRepository {
  /** Another device: phone + code return only that appointment (throttled by the database). */
  findByCode(phone: string, publicCode: string): Promise<DataSnapshot>;
  /** Another device: cancels with phone + code. */
  cancelWithPhone(publicCode: string, phone: string): Promise<void>;
}

export interface SupabaseDataRepositories extends DataRepositories {
  clientAppointments: SupabaseClientAppointmentsRepository;
}

export interface SupabaseRepositoryOptions {
  /** Client or a factory, so the client is only created when a method is actually called. */
  client: DhowSupabaseClient | (() => DhowSupabaseClient);
  accessStore?: AppointmentAccessStore;
  clientDevice?: ClientDeviceStore;
  now?: () => Date;
  /** Days ahead whose busy intervals are loaded for availability (the database still has the final word). */
  busyHorizonDays?: number;
}

interface CancelResult {
  ok?: boolean;
  error?: string;
}

/**
 * Repositories backed by Supabase through the anon key: public tables under RLS and the
 * SECURITY DEFINER RPCs. Nothing here bypasses RLS or uses the service_role key.
 * Not wired into the app yet — `dataRepositories` stays local.
 */
export function createSupabaseDataRepositories(options: SupabaseRepositoryOptions): SupabaseDataRepositories {
  const getClient = typeof options.client === "function" ? options.client : () => options.client as DhowSupabaseClient;
  const accessStore = options.accessStore ?? createAppointmentAccessStore();
  const now = options.now ?? (() => new Date());
  const busyHorizonDays = options.busyHorizonDays ?? 28;

  const fetchSettings = () =>
    unwrap<SettingsRow | null>(getClient().from("business_settings").select(SETTINGS_COLUMNS).maybeSingle() as PromiseLike<QueryResult<SettingsRow | null>>);
  const fetchServices = () =>
    unwrap<ServiceRow[]>(getClient().from("services").select(SERVICE_COLUMNS).order("sort_order").order("name") as PromiseLike<QueryResult<ServiceRow[]>>);
  const fetchBusinessHours = () =>
    unwrap<BusinessHoursRow[]>(getClient().from("business_hours").select(BUSINESS_HOURS_COLUMNS).order("weekday") as PromiseLike<QueryResult<BusinessHoursRow[]>>);
  const fetchBlockedDates = (fromDate: string) =>
    unwrap<BlockedDateRow[]>(getClient().from("blocked_dates").select(BLOCKED_DATE_COLUMNS).gte("end_date", fromDate).order("start_date") as PromiseLike<QueryResult<BlockedDateRow[]>>);
  const fetchPortfolio = () =>
    unwrap<PortfolioRow[]>(getClient().from("portfolio").select(PORTFOLIO_COLUMNS).eq("active", true).order("sort_order") as PromiseLike<QueryResult<PortfolioRow[]>>);
  const fetchReviews = () =>
    unwrap<ReviewRow[]>(getClient().from("reviews").select("body").eq("active", true).order("sort_order") as PromiseLike<QueryResult<ReviewRow[]>>);
  const fetchBusy = (date: string) =>
    unwrap<BusyIntervalRow[]>(getClient().rpc("get_busy_intervals", { p_date: date }) as PromiseLike<QueryResult<BusyIntervalRow[]>>);

  function horizonDates(): string[] {
    const start = now();
    return Array.from({ length: busyHorizonDays }, (_, offset) => {
      const date = new Date(start);
      date.setDate(start.getDate() + offset);
      return getLocalDateKey(date);
    });
  }

  /** Snapshot with the client's appointments and the service copy of each booking. */
  function toClientSnapshot(rows: ClientAppointmentRow[]): DataSnapshot {
    const byCode = new Map<string, ClientAppointmentRow>();
    rows.forEach((row) => byCode.set(row.public_code, row));
    const mapped = [...byCode.values()]
      .map(toClientAppointment)
      .sort((first, second) => `${first.appointment.data}${first.appointment.hora}${first.appointment.codigo}`
        .localeCompare(`${second.appointment.data}${second.appointment.hora}${second.appointment.codigo}`));
    return {
      ...createFreshLegacyDatabase(),
      servicos: mapped.map((item) => item.service),
      agendamentos: mapped.map((item) => item.appointment),
    };
  }

  async function clientSnapshot(): Promise<DataSnapshot> {
    const results = await Promise.all(accessStore.getTokens().map((token) =>
      unwrap<ClientAppointmentRow[]>(getClient().rpc("get_client_appointments", { p_device_token: token }) as PromiseLike<QueryResult<ClientAppointmentRow[]>>)));
    return toClientSnapshot(results.flat());
  }

  async function cancel(args: { p_public_code: string; p_device_token?: string; p_customer_phone?: string }) {
    const result = await unwrap<CancelResult>(getClient().rpc("cancel_client_appointment", args) as PromiseLike<QueryResult<CancelResult>>);
    if (!result?.ok) throw toRemoteError(result?.error);
  }

  return {
    siteContent: {
      async getSiteContent() {
        const [settings, services, portfolio, reviews] = await Promise.all([
          fetchSettings(), fetchServices(), fetchPortfolio(), fetchReviews(),
        ]);
        const config = settings ? toLegacyConfig(settings) : null;
        return {
          config: config
            ? {
                nome: config.nome, endereco: config.endereco, bairro: config.bairro, cidade: config.cidade,
                cep: config.cep, telefone: config.telefone, telefoneRaw: config.telefoneRaw,
                whatsapp: config.whatsapp, instagram: config.instagram, nota: config.nota, avaliacoes: config.avaliacoes,
              }
            : defaultPublicContent.config,
          servicos: services.map(toLegacyService).filter((service) => service.ativo),
          portfolio: portfolio.map(toLegacyPortfolioItem),
          depoimentos: reviews.length ? reviews.map((review) => review.body) : defaultPublicContent.depoimentos,
        };
      },
    },

    booking: {
      async getSnapshot() {
        const dates = horizonDates();
        const [settings, services, days, blocks, busy] = await Promise.all([
          fetchSettings(),
          fetchServices(),
          fetchBusinessHours(),
          fetchBlockedDates(dates[0]),
          Promise.all(dates.map(async (date) => (await fetchBusy(date)).map((interval) => toOccupiedAppointment(date, interval)))),
        ]);
        const fresh = createFreshLegacyDatabase();
        return {
          ...fresh,
          config: settings ? toLegacyConfig(settings) : { ...fresh.config, senha: "" },
          servicos: services.map(toLegacyService),
          horarios: toLegacyHours(settings, days),
          bloqueios: blocks.map(toLegacyBlock),
          agendamentos: busy.flat(),
          portfolio: [],
        };
      },

      async createAppointment(draft, loadedSnapshot) {
        const service = getService(loadedSnapshot, draft.servicoId) as RemoteLegacyService | undefined;
        if (!service?.remoteId) throw new Error("Este serviço não está mais disponível.");
        if (!draft.data || !draft.hora || !draft.pagamento) throw new Error("O pedido de agendamento está incompleto.");

        const created = toCreatedAppointment(await unwrap<unknown>(getClient().rpc("create_appointment", {
          p_service_id: service.remoteId,
          p_date: draft.data,
          p_start_time: draft.hora,
          p_customer_name: draft.nome.trim(),
          p_customer_phone: draft.telefone.trim(),
          p_payment_method: draft.pagamento,
          p_notes: draft.obs.trim(),
          p_device_token: accessStore.getDeviceToken() ?? undefined,
        }) as PromiseLike<QueryResult<unknown>>));
        accessStore.save(created.publicCode, created.deviceToken);

        const appointment: LegacyAppointment = {
          id: created.id,
          codigo: created.publicCode,
          cliente: draft.nome.trim(),
          telefone: draft.telefone.trim(),
          telDigits: normalizePhoneDigits(draft.telefone),
          servicoId: service.id,
          data: created.date,
          hora: created.startTime,
          duracao: minutesBetween(created.startTime, created.endTime),
          pagamento: draft.pagamento,
          obs: draft.obs.trim(),
          status: "pendente",
          criadoEm: now().toISOString(),
        };
        return {
          database: { ...loadedSnapshot, agendamentos: [...loadedSnapshot.agendamentos, appointment] },
          appointment,
          service,
        };
      },
    },

    clientAppointments: {
      getSnapshot: clientSnapshot,

      async cancelAppointment(appointmentId) {
        const token = accessStore.getToken(appointmentId);
        if (!token) throw toRemoteError("APPOINTMENT_NOT_FOUND");
        await cancel({ p_public_code: appointmentId, p_device_token: token });
        return clientSnapshot();
      },

      async findByCode(phone, publicCode) {
        const rows = await unwrap<ClientAppointmentRow[]>(getClient().rpc("get_client_appointment_by_code", {
          p_customer_phone: phone,
          p_public_code: publicCode,
        }) as PromiseLike<QueryResult<ClientAppointmentRow[]>>);
        return toClientSnapshot(rows);
      },

      async cancelWithPhone(publicCode, phone) {
        await cancel({ p_public_code: publicCode, p_customer_phone: phone });
      },
    },

    // Last phone used stays a device preference, exactly as in the local repository.
    clientDevice: options.clientDevice ?? createLocalDataRepositories().clientDevice,
  };
}
