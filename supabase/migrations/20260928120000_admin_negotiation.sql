-- Dhow Barber — status "negociando" e regras do Admin (Fase Admin, parte 1).
--
-- Decisões aprovadas:
--   1. "negociando" continua reservando o horário original (entra na constraint anti-double-booking);
--   2. negociando → confirmado | cancelado;
--   3. concluido e cancelado são finais (sem "Reabrir");
--   4. o cliente pode cancelar enquanto estiver negociando (token ou telefone + código);
--   5. reagendamento e recusado continuam aceitos pelo banco (compatibilidade com o legado),
--      mas o Admin não os oferece como destino e não há transições a partir deles.
-- A alteração de data/horário durante a negociação (admin_reschedule_appointment) é uma fase futura;
-- o histórico já registra data/horário antigos e novos quando mudarem.

-- ---------------------------------------------------------------------------
-- 1) Novo status
-- ---------------------------------------------------------------------------

alter table public.appointments drop constraint appointments_status;
alter table public.appointments add constraint appointments_status check (
  status in ('pendente', 'confirmado', 'negociando', 'concluido', 'cancelado', 'reagendamento', 'recusado')
);

-- ---------------------------------------------------------------------------
-- 2) "negociando" ocupa horário: mesma garantia atômica, lista de status ampliada
-- ---------------------------------------------------------------------------

alter table public.appointments drop constraint appointments_no_overlap;
alter table public.appointments add constraint appointments_no_overlap
  exclude using gist (time_range with &&)
  where (status in ('pendente', 'confirmado', 'negociando'));

-- ---------------------------------------------------------------------------
-- 3) Histórico: nota opcional do barbeiro e data/horário antigos e novos
-- ---------------------------------------------------------------------------

alter table public.appointment_status_history
  add column note text,
  add column old_appointment_date date,
  add column old_start_time time,
  add column old_end_time time,
  add column new_appointment_date date,
  add column new_start_time time,
  add column new_end_time time,
  add constraint appointment_status_history_note check (note is null or length(note) <= 500);

-- A nota chega pela configuração local da transação `dhow.status_note`, que só
-- admin_set_appointment_status define (e limpa logo após o update).
create or replace function private.log_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text := nullif(current_setting('dhow.status_note', true), '');
  v_time_changed boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_status_history (appointment_id, old_status, new_status)
    values (new.id, null, new.status);
    return new;
  end if;

  v_time_changed := new.appointment_date is distinct from old.appointment_date
    or new.start_time is distinct from old.start_time
    or new.end_time is distinct from old.end_time;

  if new.status is distinct from old.status or v_time_changed then
    insert into public.appointment_status_history (
      appointment_id, old_status, new_status, note,
      old_appointment_date, old_start_time, old_end_time,
      new_appointment_date, new_start_time, new_end_time
    ) values (
      new.id, old.status, new.status, v_note,
      case when v_time_changed then old.appointment_date end,
      case when v_time_changed then old.start_time end,
      case when v_time_changed then old.end_time end,
      case when v_time_changed then new.appointment_date end,
      case when v_time_changed then new.start_time end,
      case when v_time_changed then new.end_time end
    );
  end if;
  return new;
end;
$$;

drop trigger appointments_log_status on public.appointments;
create trigger appointments_log_status
  after insert or update of status, appointment_date, start_time, end_time on public.appointments
  for each row execute function private.log_appointment_status();

revoke all on function private.log_appointment_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Funções afetadas (mesma lógica; só as listas de status mudam)
-- ---------------------------------------------------------------------------

create or replace function public.get_busy_intervals(p_date date)
returns table (start_time time, end_time time)
language sql
stable
security definer
set search_path = ''
as $$
  select a.start_time, a.end_time
  from public.appointments a
  where a.appointment_date = p_date
    and a.status in ('pendente', 'confirmado', 'negociando')
  order by a.start_time;
$$;

-- Igual à versão anterior; única mudança: o limite por telefone também conta "negociando".
create or replace function public.create_appointment(
  p_service_id uuid,
  p_date date,
  p_start_time time,
  p_customer_name text,
  p_customer_phone text,
  p_payment_method text,
  p_notes text default '',
  p_device_token text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings public.business_settings;
  v_service public.services;
  v_day public.business_hours;
  v_open time;
  v_close time;
  v_duration integer;
  v_end time;
  v_now timestamp;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_digits text := private.normalize_phone_digits(p_customer_phone);
  v_token text;
  v_code text;
  v_id uuid;
  v_constraint text;
begin
  select * into v_settings from public.business_settings where id;
  if not found then
    raise exception 'BUSINESS_NOT_CONFIGURED';
  end if;

  select * into v_service from public.services where id = p_service_id and active;
  if not found then
    raise exception 'SERVICE_UNAVAILABLE';
  end if;

  if length(v_name) < 2 or length(v_name) > 120 or v_digits is null then
    raise exception 'INVALID_CUSTOMER';
  end if;
  if p_payment_method is null or p_payment_method not in ('PIX', 'CARTÃO', 'DINHEIRO') then
    raise exception 'INVALID_PAYMENT';
  end if;
  if p_date is null or p_start_time is null or length(coalesce(p_notes, '')) > 1000 then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  v_duration := coalesce(v_service.duration_minutes, v_settings.slot_interval_minutes);
  v_end := p_start_time + make_interval(mins => v_duration);
  if v_end <= p_start_time then
    raise exception 'SLOT_UNAVAILABLE';  -- passaria da meia-noite
  end if;

  -- Antecedência mínima de 15 minutos, no horário da barbearia.
  v_now := now() at time zone v_settings.timezone;
  if p_date + p_start_time < v_now + interval '15 minutes' then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  -- Faixa do dia: modo livre ou grade semanal.
  if v_settings.free_schedule or not v_settings.schedule_configured then
    v_open := v_settings.free_start;
    v_close := v_settings.free_end;
  else
    select * into v_day from public.business_hours where weekday = extract(dow from p_date)::smallint;
    if not found or not v_day.is_open then
      raise exception 'SLOT_UNAVAILABLE';
    end if;
    v_open := v_day.open_time;
    v_close := v_day.close_time;
  end if;

  if p_start_time < v_open or v_end > v_close
     or (extract(epoch from (p_start_time - v_open))::integer / 60) % v_settings.slot_interval_minutes <> 0 then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  if v_settings.lunch_enabled
     and p_start_time < v_settings.lunch_end and v_settings.lunch_start < v_end then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  if exists (
    select 1 from public.blocked_dates b
    where p_date between b.start_date and b.end_date
      and (b.all_day or (p_start_time < b.end_time and b.start_time < v_end))
  ) then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  if v_settings.max_active_bookings_per_phone is not null and (
    select count(*) from public.appointments a
    where a.customer_phone_digits = v_digits
      and a.status in ('pendente', 'confirmado', 'negociando')
      and a.appointment_date >= v_now::date
  ) >= v_settings.max_active_bookings_per_phone then
    raise exception 'TOO_MANY_ACTIVE_BOOKINGS';
  end if;

  -- Token do aparelho: reaproveita o que o aparelho já tem (formato válido) ou cria um novo.
  v_token := case
    when p_device_token ~ '^[0-9a-f]{64}$' then p_device_token
    else encode(extensions.gen_random_bytes(32), 'hex')
  end;

  -- Tenta gravar; só repete se o código público sorteado já existir.
  for attempt in 1..5 loop
    v_code := private.generate_public_code();
    begin
      insert into public.appointments (
        public_code, service_id, service_name, price_cents, price_label,
        customer_name, customer_phone, customer_phone_digits,
        appointment_date, start_time, end_time,
        status, payment_method, notes, source, access_token_hash
      ) values (
        v_code, v_service.id, v_service.name, v_service.price_cents, v_service.price_label,
        v_name, btrim(p_customer_phone), v_digits,
        p_date, p_start_time, v_end,
        'pendente', p_payment_method, btrim(coalesce(p_notes, '')), 'site', private.token_hash(v_token)
      )
      returning id into v_id;
      exit;
    exception
      when exclusion_violation then
        raise exception 'SLOT_TAKEN';
      when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint <> 'appointments_public_code_key' or attempt = 5 then
          raise;
        end if;
    end;
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'public_code', v_code,
    'device_token', v_token,
    'service_name', v_service.name,
    'appointment_date', p_date,
    'start_time', to_char(p_start_time, 'HH24:MI'),
    'end_time', to_char(v_end, 'HH24:MI'),
    'status', 'pendente'
  );
end;
$$;

-- Igual à versão anterior; única mudança: "negociando" também pode ser cancelado pelo cliente.
create or replace function public.cancel_client_appointment(
  p_public_code text,
  p_device_token text default null,
  p_customer_phone text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_digits text := private.normalize_phone_digits(p_customer_phone);
  v_token_hash bytea := private.token_hash(p_device_token);
  v_authorized boolean;
begin
  if v_token_hash is null and v_digits is null then
    return jsonb_build_object('ok', false, 'error', 'APPOINTMENT_NOT_FOUND');
  end if;
  if v_token_hash is null and private.lookup_blocked(v_digits) then
    return jsonb_build_object('ok', false, 'error', 'TOO_MANY_ATTEMPTS');
  end if;

  select * into v_appointment
  from public.appointments a
  where a.public_code = upper(btrim(coalesce(p_public_code, '')))
  for update;

  -- coalesce: comparações com NULL (ex.: agendamento importado sem token) contam como "não autorizado".
  v_authorized := found and (
    coalesce(v_token_hash is not null and v_appointment.access_token_hash = v_token_hash, false)
    or coalesce(v_digits is not null and v_appointment.customer_phone_digits = v_digits, false)
  );

  if not v_authorized then
    if v_token_hash is null then
      perform private.record_failed_lookup(v_digits);
    end if;
    return jsonb_build_object('ok', false, 'error', 'APPOINTMENT_NOT_FOUND');
  end if;

  if v_appointment.status not in ('pendente', 'confirmado', 'negociando') then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE', 'status', v_appointment.status);
  end if;

  update public.appointments set status = 'cancelado' where id = v_appointment.id;
  return jsonb_build_object('ok', true, 'public_code', v_appointment.public_code, 'status', 'cancelado');
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Admin: novo mapa de transições, nota opcional e retorno sem access_token_hash
-- ---------------------------------------------------------------------------

-- Assinatura e tipo de retorno mudam: a versão antiga é removida.
drop function public.admin_set_appointment_status(uuid, text);

create function public.admin_set_appointment_status(
  p_appointment_id uuid,
  p_status text,
  p_note text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_allowed text[];
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;
  if v_note is not null and length(v_note) > 500 then
    raise exception 'INVALID_NOTE';
  end if;

  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  -- reagendamento, recusado, concluido e cancelado: sem transições no Admin.
  v_allowed := case v_appointment.status
    when 'pendente' then array['confirmado', 'negociando', 'cancelado']
    when 'confirmado' then array['concluido', 'negociando', 'cancelado']
    when 'negociando' then array['confirmado', 'cancelado']
    else array[]::text[]
  end;
  if p_status is null or not (p_status = any (v_allowed)) then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;

  perform set_config('dhow.status_note', coalesce(v_note, ''), true);
  begin
    update public.appointments set status = p_status where id = p_appointment_id
    returning * into v_appointment;
  exception
    when exclusion_violation then
      perform set_config('dhow.status_note', '', true);
      raise exception 'SLOT_TAKEN';
  end;
  perform set_config('dhow.status_note', '', true);

  return jsonb_build_object(
    'id', v_appointment.id,
    'public_code', v_appointment.public_code,
    'status', v_appointment.status
  );
end;
$$;

revoke all on function public.admin_set_appointment_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_set_appointment_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Admin (authenticated) não lê access_token_hash
-- ---------------------------------------------------------------------------

-- O RLS continua limitando as linhas ao Admin; agora as colunas também são explícitas.
revoke select on public.appointments from authenticated;
grant select (
  id, legacy_id, public_code, service_id, service_name, price_cents, price_label,
  customer_name, customer_phone, customer_phone_digits, appointment_date, start_time, end_time,
  status, payment_method, notes, source, created_at, updated_at
) on public.appointments to authenticated;
