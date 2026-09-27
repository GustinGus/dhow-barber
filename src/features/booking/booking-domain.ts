import { defaultPublicContent } from "@/features/public/public-content";
import type {
  LegacyAppointment,
  LegacyDatabase,
  LegacyOpeningDay,
  LegacyService,
} from "@/types/legacy-database";
import type { BookingDraft, BookingFieldErrors, BookingWindow, CreateAppointmentOptions } from "./booking-types";

const DEFAULT_FREE_START = "08:00";
const DEFAULT_FREE_END = "20:00";
const BOOKING_LEAD_MINUTES = 15;
const OCCUPYING_STATUSES = new Set(["pendente", "confirmado"]);

export function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function timeFromMinutes(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

export function getService(database: LegacyDatabase, serviceId: string | null): LegacyService | undefined {
  if (!serviceId) return undefined;
  return database.servicos.find((service) => service.id === serviceId);
}

export function getEffectiveServiceDuration(
  database: LegacyDatabase,
  service: LegacyService | undefined,
): number {
  return service?.duracao || database.horarios.intervalo;
}

export function getBookingWindow(baseDate: string, now = new Date()): BookingWindow {
  const today = getLocalDateKey(now);
  const normalizedBase = baseDate < today ? today : baseDate;
  const start = fromDateKey(normalizedBase);
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return getLocalDateKey(date);
  });

  return { base: normalizedBase, dates };
}

export function shiftBookingWindow(baseDate: string, days: number, now = new Date()): string {
  const current = fromDateKey(baseDate);
  current.setDate(current.getDate() + days);
  const shifted = getLocalDateKey(current);
  const today = getLocalDateKey(now);
  return shifted < today ? today : shifted;
}

function getBlocksForDate(database: LegacyDatabase, dateKey: string) {
  return database.bloqueios.filter((block) => {
    const lastDay = block.dataFim || block.dataIni;
    return dateKey >= block.dataIni && dateKey <= lastDay;
  });
}

function getDayConfiguration(database: LegacyDatabase, dateKey: string): LegacyOpeningDay | undefined {
  const hours = database.horarios;
  const freeSchedule = Boolean(hours.livre || !hours.configurado);

  if (freeSchedule) {
    return {
      aberto: true,
      ini: hours.livreIni || DEFAULT_FREE_START,
      fim: hours.livreFim || DEFAULT_FREE_END,
    };
  }

  return hours.dias[fromDateKey(dateKey).getDay()];
}

export function isBookingDayOpen(database: LegacyDatabase, dateKey: string): boolean {
  const day = getDayConfiguration(database, dateKey);
  if (!day?.aberto) return false;
  return !getBlocksForDate(database, dateKey).some((block) => block.diaTodo);
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && startB < endA;
}

export function getAvailableSlots(
  database: LegacyDatabase,
  dateKey: string,
  duration: number,
  now = new Date(),
): string[] {
  if (!isBookingDayOpen(database, dateKey)) return [];

  const day = getDayConfiguration(database, dateKey);
  const step = database.horarios.intervalo;
  if (!day || !Number.isFinite(step) || step <= 0 || !Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const startOfDay = minutesFromTime(day.ini);
  const endOfDay = minutesFromTime(day.fim);
  const lunch = database.horarios.almoco;
  const dayBlocks = getBlocksForDate(database, dateKey)
    .filter((block) => !block.diaTodo)
    .map((block) => [minutesFromTime(block.ini), minutesFromTime(block.fim)] as const);
  const occupied = database.agendamentos
    .filter((appointment) => appointment.data === dateKey && OCCUPYING_STATUSES.has(appointment.status))
    .map((appointment) => {
      const appointmentStart = minutesFromTime(appointment.hora);
      return [appointmentStart, appointmentStart + appointment.duracao] as const;
    });
  const today = getLocalDateKey(now);
  const minimumStart = now.getHours() * 60 + now.getMinutes() + BOOKING_LEAD_MINUTES;
  const available: string[] = [];

  for (let start = startOfDay; start + duration <= endOfDay; start += step) {
    const end = start + duration;

    if (dateKey === today && start < minimumStart) continue;
    if (lunch.ativo && overlaps(start, end, minutesFromTime(lunch.ini), minutesFromTime(lunch.fim))) continue;
    if (dayBlocks.some(([blockStart, blockEnd]) => overlaps(start, end, blockStart, blockEnd))) continue;
    if (occupied.some(([appointmentStart, appointmentEnd]) => overlaps(start, end, appointmentStart, appointmentEnd))) continue;

    available.push(timeFromMinutes(start));
  }

  return available;
}

function createUid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function createFreshLegacyDatabase(): LegacyDatabase {
  return {
    config: {
      ...defaultPublicContent.config,
      canal: "whatsapp",
      canalOutro: "",
      senha: "dhow2026",
    },
    servicos: defaultPublicContent.servicos.map((service) => ({ ...service })),
    horarios: {
      livre: true,
      livreIni: DEFAULT_FREE_START,
      livreFim: DEFAULT_FREE_END,
      configurado: false,
      intervalo: 30,
      almoco: { ativo: false, ini: "12:00", fim: "13:00" },
      dias: Array.from({ length: 7 }, () => ({ aberto: false, ini: "09:00", fim: "19:00" })),
    },
    bloqueios: [],
    agendamentos: [],
    portfolio: [],
    depoimentos: [...defaultPublicContent.depoimentos],
    dataVersion: 2,
  };
}

export function appendLegacyAppointment(
  database: LegacyDatabase,
  draft: BookingDraft,
  options: CreateAppointmentOptions = {},
): { database: LegacyDatabase; appointment: LegacyAppointment; service: LegacyService } {
  const service = getService(database, draft.servicoId);
  if (!service || !draft.data || !draft.hora || !draft.pagamento) {
    throw new Error("O pedido de agendamento está incompleto.");
  }

  const duration = getEffectiveServiceDuration(database, service);
  const appointment: LegacyAppointment = {
    id: (options.uid ?? createUid)(),
    codigo: `DB-${(options.uid ?? createUid)().slice(0, 4).toUpperCase()}`,
    cliente: draft.nome.trim(),
    telefone: draft.telefone.trim(),
    telDigits: draft.telefone.replace(/\D/g, ""),
    servicoId: service.id,
    data: draft.data,
    hora: draft.hora,
    duracao: duration,
    pagamento: draft.pagamento,
    obs: draft.obs.trim(),
    status: "pendente",
    criadoEm: (options.now ?? new Date()).toISOString(),
  };

  return {
    database: { ...database, agendamentos: [...database.agendamentos, appointment] },
    appointment,
    service,
  };
}

export function validateBookingDraft(draft: BookingDraft): BookingFieldErrors {
  const errors: BookingFieldErrors = {};
  if (draft.nome.trim().length < 2) errors.nome = "Informe seu nome.";
  if (draft.telefone.replace(/\D/g, "").length < 10) errors.telefone = "Informe um telefone com DDD.";
  return errors;
}

export function maskLegacyPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function formatLegacyDate(dateKey: string): string {
  const [year, month, day] = dateKey.split("-");
  return `${day}/${month}/${year}`;
}

export function formatLegacyLongDate(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}