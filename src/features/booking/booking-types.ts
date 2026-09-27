import type { LegacyAppointment, LegacyDatabase, LegacyService } from "@/types/legacy-database";

export interface BookingDraft {
  servicoId: string | null;
  data: string | null;
  hora: string | null;
  pagamento: string | null;
  nome: string;
  telefone: string;
  obs: string;
}

export type BookingPayment = "PIX" | "CARTÃO" | "DINHEIRO";
export type BookingFieldErrors = Partial<Record<"nome" | "telefone" | "pagamento", string>>;

export interface BookingWindow {
  base: string;
  dates: string[];
}

export interface CreateAppointmentOptions {
  now?: Date;
  uid?: () => string;
}

export interface BookingConfirmation {
  database: LegacyDatabase;
  appointment: LegacyAppointment;
  service: LegacyService;
}