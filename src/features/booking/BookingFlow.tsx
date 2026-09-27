import { useEffect, useMemo, useState } from "react";
import { ptBR } from "date-fns/locale";
import { AlertCircle, ArrowLeft, CalendarCheck, Check, Clock3, Copy, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  appendLegacyAppointment,
  createFreshLegacyDatabase,
  formatLegacyDate,
  formatLegacyLongDate,
  getAvailableSlots,
  getBookingWindow,
  getEffectiveServiceDuration,
  getLocalDateKey,
  getService,
  isBookingDayOpen,
  maskLegacyPhone,
  shiftBookingWindow,
  validateBookingDraft,
} from "./booking-domain";
import { formatServiceDuration, formatServicePrice } from "@/features/public/public-content";
import type { BookingDraft, BookingPayment } from "./booking-types";
import { readMigratedLegacyDatabase } from "@/lib/storage/legacy-migration";
import { writeLegacyDatabase, writeLegacyLastPhone } from "@/lib/storage/legacy-storage";
import type { LegacyAppointment, LegacyDatabase } from "@/types/legacy-database";
import "./booking.css";

const stepLabels = ["Serviço", "Data", "Horário", "Dados do cliente", "Confirmação"];
const paymentOptions: BookingPayment[] = ["PIX", "CARTÃO", "DINHEIRO"];

interface BookingFlowProps {
  initialServiceId?: string | null;
}

interface BookingDestination {
  name: string;
  url: string;
  automatic: boolean;
}

const blankDraft = (): BookingDraft => ({
  servicoId: null,
  data: null,
  hora: null,
  pagamento: null,
  nome: "",
  telefone: "",
  obs: "",
});

function buildBookingMessage(database: LegacyDatabase, appointment: LegacyAppointment): string {
  const service = getService(database, appointment.servicoId);
  const lines = [
    `Olá, ${database.config.nome}! 👋`,
    "",
    "Gostaria de solicitar um agendamento:",
    "",
    `👤 Cliente: ${appointment.cliente}`,
    `📱 Telefone: ${appointment.telefone}`,
    `✂️ Serviço: ${service?.nome ?? "-"}`,
    `📅 Data: ${formatLegacyDate(appointment.data)}`,
    `🕐 Horário: ${appointment.hora}`,
    `💳 Pagamento: ${appointment.pagamento}`,
  ];

  if (appointment.obs) lines.push(`📝 Observação: ${appointment.obs}`);
  lines.push("", `🔖 Código: ${appointment.codigo}`, "", "Aguardo a confirmação do horário. Obrigado!");
  return lines.join("\n");
}

function getBookingDestination(database: LegacyDatabase, message: string): BookingDestination {
  const config = database.config;
  if (config.canal === "whatsapp") {
    return {
      name: "WhatsApp",
      url: `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(message)}`,
      automatic: true,
    };
  }
  if (config.canal === "instagram") {
    return { name: "Instagram", url: config.instagram, automatic: false };
  }
  return {
    name: "canal configurado",
    url: config.canalOutro || config.instagram,
    automatic: false,
  };
}

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Continue with the legacy browser fallback.
    }
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.style.position = "fixed";
  field.style.opacity = "0";
  document.body.append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  }
  field.remove();
  return copied;
}

export default function BookingFlow({ initialServiceId = null }: BookingFlowProps) {
  const [database, setDatabase] = useState<LegacyDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<BookingDraft>(blankDraft);
  const [weekBase, setWeekBase] = useState(() => getLocalDateKey(new Date()));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<"nome" | "telefone" | "pagamento", string>>>({});
  const [flowError, setFlowError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState<{ database: LegacyDatabase; appointment: LegacyAppointment } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void readMigratedLegacyDatabase()
      .then((saved) => {
        if (!active) return;
        const nextDatabase = saved ?? createFreshLegacyDatabase();
        setDatabase(nextDatabase);
        if (initialServiceId && getService(nextDatabase, initialServiceId)) {
          setDraft((current) => ({ ...current, servicoId: initialServiceId }));
          setStep(1);
        }
      })
      .catch(() => {
        if (active) setLoadError("Não foi possível ler os dados do agendamento neste navegador.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [initialServiceId]);

  const service = getService(database ?? createFreshLegacyDatabase(), draft.servicoId);
  const duration = database ? getEffectiveServiceDuration(database, service) : 0;
  const bookingWindow = useMemo(() => getBookingWindow(weekBase), [weekBase]);
  const selectedDate = draft.data ? new Date(`${draft.data}T12:00:00`) : undefined;
  const availableSlots = database && draft.data
    ? getAvailableSlots(database, draft.data, duration)
    : [];

  function updateDraft(patch: Partial<BookingDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
    setFlowError(null);
  }

  function goTo(nextStep: number) {
    setFlowError(null);
    setStep(Math.max(0, Math.min(stepLabels.length - 1, nextStep)));
  }

  function selectService(serviceId: string) {
    updateDraft({ servicoId: serviceId, data: null, hora: null });
    goTo(1);
  }

  function selectDate(date: Date | undefined) {
    if (!date) return;
    updateDraft({ data: getLocalDateKey(date), hora: null });
    goTo(2);
  }

  function continueToConfirmation() {
    const errors = validateBookingDraft(draft);
    if (!draft.pagamento) errors.pagamento = "Escolha como pretende pagar.";
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) goTo(4);
  }

  async function confirmAppointment() {
    if (!database || !draft.servicoId || !draft.data || !draft.hora || !draft.pagamento || submitting) return;
    setSubmitting(true);
    setFlowError(null);

    try {
      const latestDatabase = await readMigratedLegacyDatabase() ?? database;
      const latestService = getService(latestDatabase, draft.servicoId);
      if (!latestService) throw new Error("Este serviço não está mais disponível.");

      const latestDuration = getEffectiveServiceDuration(latestDatabase, latestService);
      const currentSlots = getAvailableSlots(latestDatabase, draft.data, latestDuration);
      if (!currentSlots.includes(draft.hora)) {
        updateDraft({ hora: null });
        goTo(2);
        setFlowError("Esse horário acabou de ser ocupado. Escolha outro horário.");
        return;
      }

      const result = appendLegacyAppointment(latestDatabase, draft);
      await writeLegacyDatabase(result.database);
      try {
        writeLegacyLastPhone(result.appointment.telDigits);
      } catch {
        // The appointment record is saved even if remembering the phone is unavailable.
      }
      setDatabase(result.database);
      setCompleted({ database: result.database, appointment: result.appointment });
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "Não foi possível salvar a solicitação.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="booking-page" aria-live="polite"><p className="booking-state">Carregando horários…</p></main>;
  }

  if (loadError || !database) {
    return (
      <main className="booking-page">
        <p className="booking-error" role="alert">{loadError ?? "Os dados do agendamento não estão disponíveis."}</p>
        <a className="booking-back-link" href="#/">Voltar ao site</a>
      </main>
    );
  }

  if (completed) {
    return <BookingSuccess database={completed.database} appointment={completed.appointment} copied={copied} onCopy={async (text) => setCopied(await copyText(text))} />;
  }

  const services = database.servicos.filter((item) => item.ativo);
  const freeSchedule = Boolean(database.horarios.livre || !database.horarios.configurado);
  const canGoPreviousWeek = weekBase > getLocalDateKey(new Date());

  return (
    <main className="booking-page">
      <div className="booking-shell">
        <header className="booking-header">
          <a className="booking-back-link" href="#/" aria-label="Voltar ao site Dhow Barber">
            <ArrowLeft aria-hidden="true" />
            <span>Dhow Barber</span>
          </a>
          <span className="booking-header__note">Agendamento online</span>
        </header>

        <ol className="booking-progress" aria-label="Etapas do agendamento">
          {stepLabels.map((label, index) => (
            <li className={index === step ? "is-current" : index < step ? "is-complete" : ""} key={label} aria-current={index === step ? "step" : undefined}>
              <span className="booking-progress__mark">{index < step ? <Check aria-hidden="true" /> : index + 1}</span>
              <span className="booking-progress__label">{label}</span>
            </li>
          ))}
        </ol>

        {flowError && <p className="booking-error" role="alert"><AlertCircle aria-hidden="true" />{flowError}</p>}

        {step === 0 && (
          <section className="booking-stage" aria-labelledby="booking-service-title">
            <p className="booking-eyebrow">Etapa 1 de 5</p>
            <h1 id="booking-service-title">O que você deseja fazer?</h1>
            <p className="booking-lede">Escolha um serviço para começar.</p>
            {services.length ? (
              <div className="booking-service-list">
                {services.map((item) => (
                  <button className={`booking-service${draft.servicoId === item.id ? " is-selected" : ""}`} key={item.id} type="button" onClick={() => selectService(item.id)}>
                    <span className="booking-service__icon"><Scissors aria-hidden="true" /></span>
                    <span className="booking-service__main">
                      <strong>{item.nome}</strong>
                      <span>{[formatServicePrice(item.preco), item.duracao ? formatServiceDuration(item.duracao) : null, item.desc || null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="booking-service__select">Selecionar</span>
                  </button>
                ))}
              </div>
            ) : <p className="booking-state">Nenhum serviço ativo no momento.</p>}
          </section>
        )}

        {step === 1 && service && (
          <section className="booking-stage" aria-labelledby="booking-date-title">
            <p className="booking-eyebrow">Etapa 2 de 5 · {service.nome}</p>
            <h1 id="booking-date-title">Escolha uma data</h1>
            <p className="booking-lede">{formatServiceDuration(duration)} reservados para o atendimento.</p>
            <div className="booking-week-controls">
              <Button variant="outline" type="button" disabled={!canGoPreviousWeek} onClick={() => setWeekBase((base) => shiftBookingWindow(base, -7))}>
                <ArrowLeft aria-hidden="true" /> Semana anterior
              </Button>
              <p>{formatLegacyDate(bookingWindow.dates[0])} – {formatLegacyDate(bookingWindow.dates[6])}</p>
              <Button variant="outline" type="button" onClick={() => setWeekBase((base) => shiftBookingWindow(base, 7))}>
                Próxima semana <ArrowLeft className="booking-next-icon" aria-hidden="true" />
              </Button>
            </div>
            <div className="booking-calendar-wrap">
              <Calendar
                mode="single"
                locale={ptBR}
                month={new Date(`${bookingWindow.base}T12:00:00`)}
                selected={selectedDate}
                onSelect={selectDate}
                hideNavigation
                showOutsideDays
                disabled={(date) => {
                  const key = getLocalDateKey(date);
                  if (key < bookingWindow.dates[0] || key > bookingWindow.dates[6]) return true;
                  if (!isBookingDayOpen(database, key)) return true;
                  return getAvailableSlots(database, key, duration).length === 0;
                }}
                className="booking-calendar"
              />
            </div>
            <p className="booking-help">{freeSchedule ? "Escolha o dia; o barbeiro confirma o horário em seguida." : "Dias fechados, feriados e bloqueios aparecem indisponíveis."}</p>
            <StepBack onClick={() => goTo(0)} label="Voltar aos serviços" />
          </section>
        )}

        {step === 2 && service && draft.data && (
          <section className="booking-stage" aria-labelledby="booking-time-title">
            <p className="booking-eyebrow">Etapa 3 de 5 · {service.nome}</p>
            <h1 id="booking-time-title">Escolha seu horário</h1>
            <p className="booking-lede">{formatLegacyLongDate(draft.data)} · {formatServiceDuration(duration)} de atendimento.</p>
            {availableSlots.length ? (
              <div className="booking-slot-list" aria-label="Horários disponíveis">
                {availableSlots.map((slot) => (
                  <button className={`booking-slot${draft.hora === slot ? " is-selected" : ""}`} key={slot} type="button" aria-pressed={draft.hora === slot} onClick={() => { updateDraft({ hora: slot }); goTo(3); }}>
                    <Clock3 aria-hidden="true" /> {slot}
                  </button>
                ))}
              </div>
            ) : (
              <div className="booking-state"><p>Não há horários livres nesse dia.</p><Button variant="outline" type="button" onClick={() => goTo(1)}>Escolher outra data</Button></div>
            )}
            {freeSchedule && <p className="booking-help">O horário fica como solicitação até o barbeiro confirmar.</p>}
            <StepBack onClick={() => goTo(1)} label="Voltar às datas" />
          </section>
        )}

        {step === 3 && service && draft.data && draft.hora && (
          <section className="booking-stage" aria-labelledby="booking-details-title">
            <p className="booking-eyebrow">Etapa 4 de 5 · {service.nome} · {formatLegacyDate(draft.data)} às {draft.hora}</p>
            <h1 id="booking-details-title">Seus dados</h1>
            <p className="booking-lede">Para o barbeiro confirmar seu horário.</p>
            <div className="booking-fields">
              <label className="booking-field" htmlFor="booking-name">
                <span>Nome</span>
                <Input id="booking-name" name="nome" autoComplete="name" value={draft.nome} onChange={(event) => { updateDraft({ nome: event.target.value }); setFieldErrors((errors) => ({ ...errors, nome: undefined })); }} aria-invalid={Boolean(fieldErrors.nome)} />
                {fieldErrors.nome && <small role="alert">{fieldErrors.nome}</small>}
              </label>
              <label className="booking-field" htmlFor="booking-phone">
                <span>Telefone / WhatsApp</span>
                <Input id="booking-phone" name="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" value={draft.telefone} onChange={(event) => { updateDraft({ telefone: maskLegacyPhone(event.target.value) }); setFieldErrors((errors) => ({ ...errors, telefone: undefined })); }} aria-invalid={Boolean(fieldErrors.telefone)} />
                {fieldErrors.telefone && <small role="alert">{fieldErrors.telefone}</small>}
              </label>
              <fieldset className="booking-payment">
                <legend>Como você pretende pagar?</legend>
                <p>O pagamento é feito na barbearia, no dia do atendimento.</p>
                <RadioGroup value={draft.pagamento ?? ""} onValueChange={(value) => { updateDraft({ pagamento: value as BookingPayment }); setFieldErrors((errors) => ({ ...errors, pagamento: undefined })); }} aria-label="Forma de pagamento">
                  {paymentOptions.map((option) => (
                    <label className="booking-payment__option" htmlFor={`payment-${option}`} key={option}>
                      <RadioGroupItem id={`payment-${option}`} value={option} />
                      <span>{option}</span>
                    </label>
                  ))}
                </RadioGroup>
                {fieldErrors.pagamento && <small role="alert">{fieldErrors.pagamento}</small>}
              </fieldset>
              <label className="booking-field" htmlFor="booking-observation">
                <span>Observação (opcional)</span>
                <Textarea id="booking-observation" name="observacao" rows={3} value={draft.obs} onChange={(event) => updateDraft({ obs: event.target.value })} placeholder="Ex.: gostaria de manter o comprimento." />
              </label>
            </div>
            <div className="booking-actions">
              <Button variant="outline" type="button" onClick={() => goTo(2)}><ArrowLeft aria-hidden="true" /> Voltar aos horários</Button>
              <Button type="button" onClick={continueToConfirmation}>Continuar</Button>
            </div>
          </section>
        )}

        {step === 4 && service && draft.data && draft.hora && draft.pagamento && (
          <section className="booking-stage" aria-labelledby="booking-confirm-title">
            <p className="booking-eyebrow">Etapa 5 de 5</p>
            <h1 id="booking-confirm-title">Confira seu agendamento</h1>
            <p className="booking-lede">Se estiver tudo certo, confirme a solicitação.</p>
            <dl className="booking-summary">
              <SummaryRow label="Cliente" value={draft.nome.trim()} />
              <SummaryRow label="Serviço" value={service.nome} />
              {service.preco != null && <SummaryRow label="Valor" value={formatServicePrice(service.preco)} />}
              <SummaryRow label="Data" value={formatLegacyDate(draft.data)} />
              <SummaryRow label="Horário" value={draft.hora} />
              <SummaryRow label="Duração" value={formatServiceDuration(duration)} />
              <SummaryRow label="Pagamento" value={draft.pagamento} />
              <SummaryRow label="Telefone" value={draft.telefone.trim()} />
              {draft.obs.trim() && <SummaryRow label="Observação" value={draft.obs.trim()} />}
            </dl>
            <p className="booking-help">A solicitação vai para o barbeiro. Você recebe a confirmação do horário em seguida.</p>
            <div className="booking-actions">
              <Button variant="outline" type="button" onClick={() => goTo(3)}><ArrowLeft aria-hidden="true" /> Voltar aos dados</Button>
              <Button type="button" disabled={submitting} onClick={() => void confirmAppointment()}>{submitting ? "Salvando…" : "Confirmar solicitação"}</Button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function StepBack({ onClick, label }: { onClick: () => void; label: string }) {
  return <Button className="booking-back-step" variant="ghost" type="button" onClick={onClick}><ArrowLeft aria-hidden="true" /> {label}</Button>;
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return <div className="booking-summary__row"><dt>{label}</dt><dd>{value}</dd></div>;
}

function BookingSuccess({
  database,
  appointment,
  copied,
  onCopy,
}: {
  database: LegacyDatabase;
  appointment: LegacyAppointment;
  copied: boolean;
  onCopy: (text: string) => Promise<void>;
}) {
  const service = getService(database, appointment.servicoId);
  const message = buildBookingMessage(database, appointment);
  const destination = getBookingDestination(database, message);

  return (
    <main className="booking-page">
      <div className="booking-shell booking-success">
        <span className="booking-success__icon"><Check aria-hidden="true" /></span>
        <p className="booking-eyebrow">Solicitação registrada</p>
        <h1>Solicitação enviada</h1>
        <p className="booking-lede">Agora é só enviar a mensagem para {database.config.nome} confirmar o horário.</p>
        <dl className="booking-summary">
          <SummaryRow label="Serviço" value={service?.nome ?? "-"} />
          <SummaryRow label="Data" value={formatLegacyDate(appointment.data)} />
          <SummaryRow label="Horário" value={appointment.hora} />
          <SummaryRow label="Pagamento" value={appointment.pagamento} />
          <SummaryRow label="Código" value={appointment.codigo} />
        </dl>
        {!destination.automatic && <p className="booking-help">O {destination.name} não envia mensagem automaticamente por um site. Copie o texto e cole na conversa que vai abrir.</p>}
        <pre className="booking-message">{message}</pre>
        <div className="booking-success__actions">
          <a className="booking-success__send" href={destination.url} target="_blank" rel="noopener noreferrer" onClick={() => void onCopy(message)}>
            Enviar pelo {destination.name}
          </a>
          <Button variant="outline" type="button" onClick={() => void onCopy(message)}><Copy aria-hidden="true" /> {copied ? "Mensagem copiada" : "Copiar mensagem"}</Button>
          <a className="booking-success__secondary" href="#/meus"><CalendarCheck aria-hidden="true" /> Ver meu agendamento</a>
          <a className="booking-back-link" href="#/">Voltar para o início</a>
        </div>
        <p className="booking-help">Aguarde a confirmação do barbeiro.</p>
      </div>
    </main>
  );
}