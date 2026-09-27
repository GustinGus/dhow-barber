-- Dhow Barber — funções de agendamento (Fase 1).
-- Todas as operações do cliente passam por estas funções SECURITY DEFINER; a tabela
-- public.appointments não tem nenhum privilégio para `anon`.
-- Erros de regra usam mensagens-código estáveis para o frontend traduzir:
--   SERVICE_UNAVAILABLE, INVALID_CUSTOMER, INVALID_PAYMENT, SLOT_UNAVAILABLE, SLOT_TAKEN,
--   TOO_MANY_ACTIVE_BOOKINGS, BUSINESS_NOT_CONFIGURED, NOT_ADMIN, APPOINTMENT_NOT_FOUND,
--   INVALID_STATUS_TRANSITION, TOO_MANY_ATTEMPTS.

-- ---------------------------------------------------------------------------
-- Código público DB-XXXXXX
-- ---------------------------------------------------------------------------

-- 6 caracteres do alfabeto Crockford base32 (sem I, L, O, U): 32^6 ≈ 1,07 bilhão de códigos.
-- 32 divide 256, então `byte % 32` não tem viés. Bytes vêm do gerador criptográfico do pgcrypto.
-- A unicidade é garantida pela constraint appointments_public_code_key (ver create_appointment).
create or replace function private.generate_public_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  random_bytes bytea := extensions.gen_random_bytes(6);
  code text := 'DB-';
begin
  for i in 0..5 loop
    code := code || substr(alphabet, (get_byte(random_bytes, i) % 32) + 1, 1);
  end loop;
  return code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tentativas de consulta por telefone + código (freio contra adivinhação)
-- ---------------------------------------------------------------------------

create table private.client_lookup_attempts (
  id bigint generated always as identity primary key,
  phone_digits text not null,
  attempted_at timestamptz not null default now()
);
create index client_lookup_attempts_phone_idx on private.client_lookup_attempts (phone_digits, attempted_at);
revoke all on table private.client_lookup_attempts from public, anon, authenticated;

-- true quando o telefone passou do limite de falhas na última hora.
create or replace function private.lookup_blocked(p_phone_digits text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select count(*) >= 10
  from private.client_lookup_attempts
  where phone_digits = p_phone_digits
    and attempted_at > now() - interval '1 hour';
$$;

create or replace function private.record_failed_lookup(p_phone_digits text)
returns void
language sql
volatile
set search_path = ''
as $$
  delete from private.client_lookup_attempts where attempted_at < now() - interval '1 day';
  insert into private.client_lookup_attempts (phone_digits) values (coalesce(p_phone_digits, ''));
$$;

create or replace function private.token_hash(p_token text)
returns bytea
language sql
immutable
set search_path = ''
as $$
  select case
    when p_token ~ '^[0-9a-f]{64}$' then extensions.digest(p_token, 'sha256')
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Público: intervalos ocupados de um dia (sem nome, telefone ou serviço)
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
    and a.status in ('pendente', 'confirmado')
  order by a.start_time;
$$;

-- ---------------------------------------------------------------------------
-- Público: criar agendamento (validação no servidor + garantia atômica)
-- ---------------------------------------------------------------------------

-- Replica as regras de disponibilidade do site (booking-domain.ts / legado slotsDisponiveis)
-- usando dados do banco — duração vem do serviço, nunca do navegador. A proteção contra
-- sobreposição NÃO depende destas checagens: é a constraint appointments_no_overlap.
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
      and a.status in ('pendente', 'confirmado')
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

-- ---------------------------------------------------------------------------
-- Cliente: consultar os próprios agendamentos
-- ---------------------------------------------------------------------------

-- Pelo token do aparelho: só os agendamentos criados com aquele token.
-- Um telefone digitado NÃO dá acesso a nada sozinho (evita vazar dados de terceiros).
create or replace function public.get_client_appointments(p_device_token text)
returns table (
  public_code text, service_name text, appointment_date date, start_time time, end_time time,
  status text, payment_method text, notes text, customer_name text, customer_phone text,
  price_cents integer, price_label text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.public_code, a.service_name, a.appointment_date, a.start_time, a.end_time,
         a.status, a.payment_method, a.notes, a.customer_name, a.customer_phone,
         a.price_cents, a.price_label
  from public.appointments a
  where private.token_hash(p_device_token) is not null
    and a.access_token_hash = private.token_hash(p_device_token)
  order by a.appointment_date, a.start_time;
$$;

-- Em outro aparelho: telefone + código DB-… devolvem só aquele agendamento.
-- Falhas contam por telefone; depois de 10 na última hora a consulta é recusada.
create or replace function public.get_client_appointment_by_code(p_customer_phone text, p_public_code text)
returns table (
  public_code text, service_name text, appointment_date date, start_time time, end_time time,
  status text, payment_method text, notes text, customer_name text, customer_phone text,
  price_cents integer, price_label text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_digits text := private.normalize_phone_digits(p_customer_phone);
begin
  if v_digits is null then
    return;
  end if;
  if private.lookup_blocked(v_digits) then
    raise exception 'TOO_MANY_ATTEMPTS';
  end if;

  return query
    select a.public_code, a.service_name, a.appointment_date, a.start_time, a.end_time,
           a.status, a.payment_method, a.notes, a.customer_name, a.customer_phone,
           a.price_cents, a.price_label
    from public.appointments a
    where a.customer_phone_digits = v_digits
      and a.public_code = upper(btrim(coalesce(p_public_code, '')));

  if not found then
    perform private.record_failed_lookup(v_digits);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cliente: cancelar (mesma regra do site: só pendente ou confirmado)
-- ---------------------------------------------------------------------------

-- Prova: token do aparelho OU telefone. Sempre exige o código.
-- Falhas devolvem {ok:false} (sem exceção) para o registro de tentativa não ser desfeito,
-- e a mesma resposta para "não existe" e "não é seu", sem revelar qual foi.
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

  if v_appointment.status not in ('pendente', 'confirmado') then
    return jsonb_build_object('ok', false, 'error', 'NOT_CANCELLABLE', 'status', v_appointment.status);
  end if;

  update public.appointments set status = 'cancelado' where id = v_appointment.id;
  return jsonb_build_object('ok', true, 'public_code', v_appointment.public_code, 'status', 'cancelado');
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin: mudar status (mesmas transições do painel legado)
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_appointment_status(p_appointment_id uuid, p_status text)
returns public.appointments
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appointment public.appointments;
  v_allowed text[];
begin
  if not private.is_admin() then
    raise exception 'NOT_ADMIN';
  end if;

  select * into v_appointment from public.appointments where id = p_appointment_id for update;
  if not found then
    raise exception 'APPOINTMENT_NOT_FOUND';
  end if;

  v_allowed := case v_appointment.status
    when 'pendente' then array['confirmado', 'reagendamento', 'recusado']
    when 'confirmado' then array['concluido', 'cancelado']
    when 'reagendamento' then array['confirmado', 'cancelado']
    when 'recusado' then array['pendente']
    when 'cancelado' then array['pendente']
    else array[]::text[]
  end;
  if p_status is null or not (p_status = any (v_allowed)) then
    raise exception 'INVALID_STATUS_TRANSITION';
  end if;

  begin
    update public.appointments set status = p_status where id = p_appointment_id
    returning * into v_appointment;
  exception
    when exclusion_violation then
      -- Reabrir/confirmar um horário que outro agendamento ativo já ocupa.
      raise exception 'SLOT_TAKEN';
  end;
  return v_appointment;
end;
$$;

-- ---------------------------------------------------------------------------
-- Privilégios de execução (o Supabase concede EXECUTE a todos por padrão)
-- ---------------------------------------------------------------------------

revoke all on function private.generate_public_code() from public, anon, authenticated;
revoke all on function private.lookup_blocked(text) from public, anon, authenticated;
revoke all on function private.record_failed_lookup(text) from public, anon, authenticated;
revoke all on function private.token_hash(text) from public, anon, authenticated;

revoke all on function public.get_busy_intervals(date) from public, anon, authenticated;
revoke all on function public.create_appointment(uuid, date, time, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.get_client_appointments(text) from public, anon, authenticated;
revoke all on function public.get_client_appointment_by_code(text, text) from public, anon, authenticated;
revoke all on function public.cancel_client_appointment(text, text, text) from public, anon, authenticated;
revoke all on function public.admin_set_appointment_status(uuid, text) from public, anon, authenticated;

grant execute on function public.get_busy_intervals(date) to anon, authenticated;
grant execute on function public.create_appointment(uuid, date, time, text, text, text, text, text) to anon, authenticated;
grant execute on function public.get_client_appointments(text) to anon, authenticated;
grant execute on function public.get_client_appointment_by_code(text, text) to anon, authenticated;
grant execute on function public.cancel_client_appointment(text, text, text) to anon, authenticated;
grant execute on function public.admin_set_appointment_status(uuid, text) to authenticated;
