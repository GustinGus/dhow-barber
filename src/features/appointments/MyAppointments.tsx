import { type FormEvent, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, CalendarDays, ChevronDown, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createFreshLegacyDatabase,
  formatLegacyDate,
  formatLegacyLongDate,
  getLocalDateKey,
  getService,
  maskLegacyPhone,
} from "@/features/booking/booking-domain";
import { formatServiceDuration, formatServicePrice } from "@/features/public/public-content";
import { readMigratedLegacyDatabase } from "@/lib/storage/legacy-migration";
import { readLegacyLastPhone, writeLegacyDatabase, writeLegacyLastPhone } from "@/lib/storage/legacy-storage";
import type { LegacyAppointment, LegacyDatabase } from "@/types/legacy-database";
import {
  canClientCancel,
  cancelClientAppointment,
  findClientAppointments,
  getAppointmentStatusLabel,
  getPhoneDigits,
  isSearchablePhone,
} from "./appointments-domain";
import "@/features/booking/booking.css";
import "./appointments.css";

function readLastPhone(): string {
  try {
    return readLegacyLastPhone();
  } catch {
    return "";
  }
}

export default function MyAppointments() {
  const [database, setDatabase] = useState<LegacyDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phone, setPhone] = useState(() => maskLegacyPhone(readLastPhone()));
  const [phoneError, setPhoneError] = useState<string | null>(null);
  // Like the legacy page, a remembered phone is searched as soon as the screen opens.
  const [searchedDigits, setSearchedDigits] = useState<string | null>(() => {
    const digits = getPhoneDigits(readLastPhone());
    return isSearchablePhone(digits) ? digits : null;
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void readMigratedLegacyDatabase()
      .then((saved) => {
        if (active) setDatabase(saved ?? createFreshLegacyDatabase());
      })
      .catch(() => {
        if (active) setLoadError("Não foi possível ler os agendamentos salvos neste navegador.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const digits = getPhoneDigits(phone);
    setNotice(null);
    setActionError(null);
    setOpenId(null);
    setConfirmingId(null);

    if (!isSearchablePhone(digits)) {
      setPhoneError("Informe o telefone completo com DDD.");
      setSearchedDigits(null);
      return;
    }

    setPhoneError(null);
    try {
      writeLegacyLastPhone(digits);
    } catch {
      // The search still works when the browser blocks storage.
    }
    setSearchedDigits(digits);
  }

  async function cancelAppointment(appointmentId: string) {
    if (cancellingId) return;
    setCancellingId(appointmentId);
    setActionError(null);

    try {
      // Re-read so a change made meanwhile (e.g. by the barber) is not overwritten.
      const latest = await readMigratedLegacyDatabase();
      if (!latest) throw new Error("Este agendamento não foi encontrado.");
      const updated = cancelClientAppointment(latest, appointmentId);
      await writeLegacyDatabase(updated);
      setDatabase(updated);
      setConfirmingId(null);
      setNotice("Agendamento cancelado.");
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Não foi possível cancelar o agendamento.");
    } finally {
      setCancellingId(null);
    }
  }

  function toggle(appointmentId: string) {
    setOpenId((current) => current === appointmentId ? null : appointmentId);
    setConfirmingId(null);
    setActionError(null);
  }

  const results = database && searchedDigits
    ? findClientAppointments(database, searchedDigits, getLocalDateKey(new Date()))
    : null;

  function renderList(appointments: LegacyAppointment[]) {
    return (
      <ul className="appointments-list">
        {appointments.map((appointment) => (
          <AppointmentItem
            key={appointment.id}
            database={database!}
            appointment={appointment}
            open={openId === appointment.id}
            confirming={confirmingId === appointment.id}
            cancelling={cancellingId === appointment.id}
            error={openId === appointment.id ? actionError : null}
            onToggle={() => toggle(appointment.id)}
            onAskCancel={() => setConfirmingId(appointment.id)}
            onKeep={() => setConfirmingId(null)}
            onCancel={() => void cancelAppointment(appointment.id)}
          />
        ))}
      </ul>
    );
  }

  return (
    <main className="booking-page">
      <div className="booking-shell">
        <header className="booking-header">
          <a className="booking-back-link" href="#/" aria-label="Voltar ao site Dhow Barber">
            <ArrowLeft aria-hidden="true" />
            <span>Dhow Barber</span>
          </a>
          <span className="booking-header__note">Área do cliente</span>
        </header>

        <section className="booking-stage appointments-page" aria-labelledby="appointments-title">
          <p className="booking-eyebrow">Consulta pelo telefone</p>
          <h1 id="appointments-title">Meus agendamentos</h1>
          <p className="booking-lede">Digite o telefone usado no agendamento.</p>

          <form className="appointments-search" onSubmit={search} noValidate>
            <label className="booking-field" htmlFor="appointments-phone">
              <span>Telefone</span>
              <Input
                id="appointments-phone"
                name="telefone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="(11) 90000-0000"
                value={phone}
                onChange={(event) => { setPhone(maskLegacyPhone(event.target.value)); setPhoneError(null); }}
                aria-invalid={Boolean(phoneError)}
              />
              {phoneError && <small role="alert">{phoneError}</small>}
            </label>
            <Button className="appointments-search__submit" type="submit">
              <Search aria-hidden="true" /> Buscar
            </Button>
          </form>

          {notice && <p className="appointments-notice" role="status">{notice}</p>}

          {loading && searchedDigits && <p className="booking-state" aria-live="polite">Carregando agendamentos…</p>}

          {loadError && <p className="booking-error" role="alert"><AlertCircle aria-hidden="true" />{loadError}</p>}

          {results && (results.upcoming.length + results.history.length === 0 ? (
            <EmptyState message="Nenhum agendamento encontrado para esse telefone." />
          ) : (
            <div className="appointments-results">
              <section aria-labelledby="appointments-upcoming-title">
                <h2 className="appointments-heading" id="appointments-upcoming-title">Próximos</h2>
                {results.upcoming.length
                  ? renderList(results.upcoming)
                  : <EmptyState message="Você não tem agendamento em aberto." />}
              </section>
              {results.history.length > 0 && (
                <section aria-labelledby="appointments-history-title">
                  <h2 className="appointments-heading" id="appointments-history-title">Histórico</h2>
                  {renderList(results.history)}
                </section>
              )}
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="appointments-empty">
      <CalendarDays aria-hidden="true" />
      <p>{message}</p>
      <a className="appointments-cta" href="#/agendar">Agendar agora</a>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  return <span className={`appointments-tag is-${status}`}>{getAppointmentStatusLabel(status)}</span>;
}

interface AppointmentItemProps {
  database: LegacyDatabase;
  appointment: LegacyAppointment;
  open: boolean;
  confirming: boolean;
  cancelling: boolean;
  error: string | null;
  onToggle: () => void;
  onAskCancel: () => void;
  onKeep: () => void;
  onCancel: () => void;
}

function AppointmentItem({
  database,
  appointment,
  open,
  confirming,
  cancelling,
  error,
  onToggle,
  onAskCancel,
  onKeep,
  onCancel,
}: AppointmentItemProps) {
  const service = getService(database, appointment.servicoId);
  const detailsId = `appointment-${appointment.id}`;
  const duration = typeof appointment.duracao === "number" && appointment.duracao > 0
    ? ` · ${formatServiceDuration(appointment.duracao)}`
    : "";

  return (
    <li className={`appointments-item${open ? " is-open" : ""}`}>
      <button className="appointments-item__summary" type="button" aria-expanded={open} aria-controls={detailsId} onClick={onToggle}>
        <span className="appointments-item__main">
          <strong>{formatLegacyLongDate(appointment.data)} · {appointment.hora}</strong>
          <span>{[service?.nome ?? "-", appointment.pagamento, appointment.codigo].filter(Boolean).join(" · ")}</span>
        </span>
        <StatusTag status={appointment.status} />
        <ChevronDown className="appointments-item__chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="appointments-item__details" id={detailsId}>
          <dl className="booking-summary">
            <DetailRow label="Código" value={appointment.codigo} />
            <DetailRow label="Cliente" value={appointment.cliente} />
            <DetailRow label="Telefone" value={appointment.telefone} />
            <DetailRow label="Serviço" value={service?.nome ?? "-"} />
            <DetailRow label="Data" value={formatLegacyDate(appointment.data)} />
            <DetailRow label="Horário" value={`${appointment.hora}${duration}`} />
            <DetailRow label="Pagamento" value={appointment.pagamento} />
            {service && service.preco != null && <DetailRow label="Valor" value={formatServicePrice(service.preco)} />}
            {appointment.obs && <DetailRow label="Observação" value={appointment.obs} />}
            <div className="booking-summary__row"><dt>Status</dt><dd><StatusTag status={appointment.status} /></dd></div>
          </dl>

          {appointment.status === "reagendamento" && (
            <>
              <p className="appointments-reschedule"><Info aria-hidden="true" />O barbeiro pediu para você escolher outro horário.</p>
              <a className="appointments-cta" href="#/agendar">Escolher outro horário</a>
            </>
          )}

          {error && <p className="booking-error" role="alert"><AlertCircle aria-hidden="true" />{error}</p>}

          {canClientCancel(appointment) && (confirming ? (
            <div className="appointments-confirm" role="group" aria-label="Confirmar cancelamento">
              <p>Cancelar o agendamento de {formatLegacyDate(appointment.data)} às {appointment.hora}?</p>
              <div className="booking-actions">
                <Button variant="outline" type="button" onClick={onKeep} disabled={cancelling}>Manter agendamento</Button>
                <Button className="appointments-danger" type="button" onClick={onCancel} disabled={cancelling}>
                  {cancelling ? "Cancelando…" : "Confirmar cancelamento"}
                </Button>
              </div>
            </div>
          ) : (
            <Button className="appointments-cancel" variant="outline" type="button" onClick={onAskCancel}>Cancelar agendamento</Button>
          ))}
        </div>
      )}
    </li>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="booking-summary__row"><dt>{label}</dt><dd>{value}</dd></div>;
}
