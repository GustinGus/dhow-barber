/**
 * Conversions between Supabase rows/RPC results and the domain shapes the React screens use
 * (the legacy `LegacyDatabase` family). SQL column names stay in this file.
 *
 * - Services keep their legacy id (`s1`…) as `id` when they have one, so deep links such as
 *   `#/agendar?s=s1` keep working; the database UUID travels in `remoteId` for the RPCs.
 * - Prices: `price_cents` (4000) ↔ number (40); `price_label` ↔ text price; both null ↔ null.
 * - Durations: `duration_minutes` ↔ `duracao` (null = schedule interval).
 * - Times: Postgres `HH:MM:SS` ↔ `HH:MM`. Appointments are `appointment_date` + `start_time`
 *   + `end_time`; `duracao` is derived from the two times.
 * - Phones: same rule as SQL `private.normalize_phone_digits` (drops a leading 55).
 * - Client RPCs return no internal id: the `public_code` is the appointment id on the client,
 *   and the service name/price are the copy taken at booking time.
 */
import { createFreshLegacyDatabase } from "@/features/booking/booking-domain";
import type {
  LegacyAppointment,
  LegacyBlock,
  LegacyConfig,
  LegacyHours,
  LegacyPortfolioItem,
  LegacyPrice,
  LegacyService,
} from "@/types/legacy-database";

export interface SettingsRow {
  name: string;
  address_line: string;
  neighborhood: string;
  city: string;
  postal_code: string;
  phone_display: string;
  phone_e164: string;
  whatsapp_number: string;
  instagram_url: string;
  booking_channel: string;
  booking_channel_url: string;
  rating_display: string;
  review_count: number;
  free_schedule: boolean;
  free_start: string;
  free_end: string;
  schedule_configured: boolean;
  slot_interval_minutes: number;
  lunch_enabled: boolean;
  lunch_start: string;
  lunch_end: string;
}

export const SETTINGS_COLUMNS = [
  "name", "address_line", "neighborhood", "city", "postal_code", "phone_display", "phone_e164",
  "whatsapp_number", "instagram_url", "booking_channel", "booking_channel_url", "rating_display",
  "review_count", "free_schedule", "free_start", "free_end", "schedule_configured",
  "slot_interval_minutes", "lunch_enabled", "lunch_start", "lunch_end",
].join(", ");

export interface ServiceRow {
  id: string;
  legacy_id: string | null;
  name: string;
  description: string;
  price_cents: number | null;
  price_label: string | null;
  duration_minutes: number | null;
  active: boolean;
}

export const SERVICE_COLUMNS = "id, legacy_id, name, description, price_cents, price_label, duration_minutes, active";

export interface BusinessHoursRow {
  weekday: number;
  is_open: boolean;
  open_time: string;
  close_time: string;
}

export const BUSINESS_HOURS_COLUMNS = "weekday, is_open, open_time, close_time";

/** Public columns only: `reason` is not granted to visitors. */
export interface BlockedDateRow {
  id: string;
  start_date: string;
  end_date: string;
  all_day: boolean;
  start_time: string;
  end_time: string;
}

export const BLOCKED_DATE_COLUMNS = "id, start_date, end_date, all_day, start_time, end_time";

export interface PortfolioRow {
  id: string;
  legacy_id: string | null;
  image_url: string;
  caption: string;
  instagram_url: string;
  active: boolean;
}

export const PORTFOLIO_COLUMNS = "id, legacy_id, image_url, caption, instagram_url, active";

export interface ReviewRow {
  body: string;
}

export interface BusyIntervalRow {
  start_time: string;
  end_time: string;
}

/** Row of get_client_appointments / get_client_appointment_by_code. */
export interface ClientAppointmentRow {
  public_code: string;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  status: string;
  payment_method: string;
  notes: string;
  customer_name: string;
  customer_phone: string;
  price_cents: number | null;
  price_label: string | null;
}

/** Result of create_appointment. */
export interface CreatedAppointment {
  id: string;
  publicCode: string;
  deviceToken: string;
  date: string;
  startTime: string;
  endTime: string;
}

/** Legacy service plus the database UUID the RPCs need. */
export type RemoteLegacyService = LegacyService & { remoteId?: string };

export function toHourMinute(value: string): string {
  return value.slice(0, 5);
}

export function minutesBetween(start: string, end: string): number {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  };
  return toMinutes(end) - toMinutes(start);
}

export function normalizePhoneDigits(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (/^55\d{10,11}$/.test(digits)) return digits.slice(2);
  return digits;
}

export function toLegacyPrice(priceCents: number | null, priceLabel: string | null): LegacyPrice {
  if (priceCents != null) return priceCents / 100;
  return priceLabel ?? null;
}

export function toLegacyService(row: ServiceRow): RemoteLegacyService {
  return {
    id: row.legacy_id ?? row.id,
    remoteId: row.id,
    nome: row.name,
    desc: row.description,
    preco: toLegacyPrice(row.price_cents, row.price_label),
    duracao: row.duration_minutes,
    ativo: row.active,
  };
}

/** Public configuration; there is no password in the database. */
export function toLegacyConfig(row: SettingsRow): LegacyConfig {
  return {
    nome: row.name,
    endereco: row.address_line,
    bairro: row.neighborhood,
    cidade: row.city,
    cep: row.postal_code,
    telefone: row.phone_display,
    telefoneRaw: row.phone_e164,
    whatsapp: row.whatsapp_number,
    instagram: row.instagram_url,
    canal: row.booking_channel,
    canalOutro: row.booking_channel_url,
    senha: "",
    nota: row.rating_display,
    avaliacoes: row.review_count,
  };
}

export function toLegacyHours(settings: SettingsRow | null, days: BusinessHoursRow[]): LegacyHours {
  const defaults = createFreshLegacyDatabase().horarios;
  const byWeekday = new Map(days.map((day) => [day.weekday, day]));
  return {
    livre: settings?.free_schedule ?? defaults.livre,
    livreIni: settings ? toHourMinute(settings.free_start) : defaults.livreIni,
    livreFim: settings ? toHourMinute(settings.free_end) : defaults.livreFim,
    configurado: settings?.schedule_configured ?? defaults.configurado,
    intervalo: settings?.slot_interval_minutes ?? defaults.intervalo,
    almoco: settings
      ? { ativo: settings.lunch_enabled, ini: toHourMinute(settings.lunch_start), fim: toHourMinute(settings.lunch_end) }
      : { ...defaults.almoco },
    dias: defaults.dias.map((fallback, weekday) => {
      const day = byWeekday.get(weekday);
      return day
        ? { aberto: day.is_open, ini: toHourMinute(day.open_time), fim: toHourMinute(day.close_time) }
        : { ...fallback };
    }),
  };
}

export function toLegacyBlock(row: BlockedDateRow): LegacyBlock {
  return {
    id: row.id,
    dataIni: row.start_date,
    dataFim: row.end_date,
    diaTodo: row.all_day,
    ini: toHourMinute(row.start_time),
    fim: toHourMinute(row.end_time),
    motivo: "",
  };
}

export function toLegacyPortfolioItem(row: PortfolioRow): LegacyPortfolioItem {
  return {
    id: row.legacy_id ?? row.id,
    image: row.image_url,
    caption: row.caption,
    instagramUrl: row.instagram_url,
    ativo: row.active,
  };
}

/**
 * A busy interval as an occupying appointment, so the existing availability rules
 * (getAvailableSlots) work unchanged. It carries no personal data.
 */
export function toOccupiedAppointment(date: string, interval: BusyIntervalRow): LegacyAppointment {
  const hora = toHourMinute(interval.start_time);
  return {
    id: `busy:${date}:${hora}`,
    codigo: "",
    cliente: "",
    telefone: "",
    telDigits: "",
    servicoId: "",
    data: date,
    hora,
    duracao: minutesBetween(interval.start_time, interval.end_time),
    pagamento: "",
    obs: "",
    status: "confirmado",
    criadoEm: "",
  };
}

/** Service entry for the name and price copied at booking time (never offered for booking). */
export function snapshotServiceId(publicCode: string): string {
  return `booking:${publicCode}`;
}

export function toClientAppointment(row: ClientAppointmentRow): { appointment: LegacyAppointment; service: LegacyService } {
  const serviceId = snapshotServiceId(row.public_code);
  return {
    appointment: {
      id: row.public_code,
      codigo: row.public_code,
      cliente: row.customer_name,
      telefone: row.customer_phone,
      telDigits: normalizePhoneDigits(row.customer_phone),
      servicoId: serviceId,
      data: row.appointment_date,
      hora: toHourMinute(row.start_time),
      duracao: minutesBetween(row.start_time, row.end_time),
      pagamento: row.payment_method,
      obs: row.notes,
      status: row.status,
      criadoEm: "",
    },
    service: {
      id: serviceId,
      nome: row.service_name,
      desc: "",
      preco: toLegacyPrice(row.price_cents, row.price_label),
      duracao: null,
      ativo: false,
    },
  };
}

/** Validates the jsonb returned by create_appointment. */
export function toCreatedAppointment(data: unknown): CreatedAppointment {
  const result = (data ?? {}) as Record<string, unknown>;
  const text = (key: string) => (typeof result[key] === "string" ? (result[key] as string) : "");
  const created = {
    id: text("id"),
    publicCode: text("public_code"),
    deviceToken: text("device_token"),
    date: text("appointment_date"),
    startTime: toHourMinute(text("start_time")),
    endTime: toHourMinute(text("end_time")),
  };
  if (!created.id || !created.publicCode || !created.date || !created.startTime || !created.endTime) {
    throw new Error("Resposta inesperada do servidor ao salvar o agendamento.");
  }
  return created;
}
