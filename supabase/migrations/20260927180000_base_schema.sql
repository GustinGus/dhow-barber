-- Dhow Barber — schema base (Fase 1).
-- Espelha o banco legado `dhow_barber_db_v1` (ver supabase/docs/legacy-import.md).
-- Datas e horas são locais da barbearia (America/Sao_Paulo, sem horário de verão desde 2019).

create extension if not exists pgcrypto with schema extensions;

-- Funções e tabelas internas ficam fora do schema exposto pela API (`public`).
create schema if not exists private;
revoke all on schema private from public;

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Dígitos do telefone sem o DDI 55, como o legado guarda em `telDigits`.
-- Devolve null quando não sobra um número brasileiro com DDD (10 ou 11 dígitos).
create or replace function private.normalize_phone_digits(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when d ~ '^[0-9]{10,11}$' then d
    when d ~ '^55[0-9]{10,11}$' then substr(d, 3)
    else null
  end
  from (select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as d) as digits;
$$;

-- ---------------------------------------------------------------------------
-- Configuração da barbearia (linha única). Legado: `config` + campos globais de `horarios`.
-- Não existe coluna de senha: o acesso do Admin será pelo Supabase Auth.
-- ---------------------------------------------------------------------------

create table public.business_settings (
  id boolean primary key default true,
  name text not null default 'Dhow Barber',
  address_line text not null default '',
  neighborhood text not null default '',
  city text not null default '',
  postal_code text not null default '',
  phone_display text not null default '',
  phone_e164 text not null default '',
  whatsapp_number text not null default '',
  instagram_url text not null default '',
  booking_channel text not null default 'whatsapp',
  booking_channel_url text not null default '',
  rating_display text not null default '',
  review_count integer not null default 0,
  timezone text not null default 'America/Sao_Paulo',
  free_schedule boolean not null default true,
  free_start time not null default '08:00',
  free_end time not null default '20:00',
  schedule_configured boolean not null default false,
  slot_interval_minutes integer not null default 30,
  lunch_enabled boolean not null default false,
  lunch_start time not null default '12:00',
  lunch_end time not null default '13:00',
  -- Limite opcional de reservas em aberto por telefone (null = sem limite, como hoje).
  max_active_bookings_per_phone integer,
  updated_at timestamptz not null default now(),
  constraint business_settings_singleton check (id),
  constraint business_settings_channel check (booking_channel in ('whatsapp', 'instagram', 'outro')),
  constraint business_settings_review_count check (review_count >= 0),
  constraint business_settings_free_range check (free_start < free_end),
  constraint business_settings_lunch_range check (lunch_start < lunch_end),
  constraint business_settings_interval check (slot_interval_minutes in (10, 15, 20, 30, 40, 45, 60)),
  constraint business_settings_max_active check (max_active_bookings_per_phone is null or max_active_bookings_per_phone > 0)
);

-- Legado: `horarios.dias[0..6]` (0 = domingo).
create table public.business_hours (
  weekday smallint primary key,
  is_open boolean not null default false,
  open_time time not null default '09:00',
  close_time time not null default '19:00',
  updated_at timestamptz not null default now(),
  constraint business_hours_weekday check (weekday between 0 and 6),
  constraint business_hours_range check (open_time < close_time)
);

-- ---------------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------------

create table public.services (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,                       -- 's1'…'s6' ou id aleatório do legado
  name text not null,
  description text not null default '',
  price_cents integer,                         -- preço numérico
  price_label text,                            -- preço em texto, ex.: 'Verificar com o Dhow'
  duration_minutes integer,                    -- null = usa slot_interval_minutes
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint services_name check (length(btrim(name)) > 0),
  constraint services_price check (price_cents is null or price_label is null),
  constraint services_price_cents check (price_cents is null or price_cents >= 0),
  constraint services_duration check (duration_minutes is null or duration_minutes between 5 and 600)
);

-- Legado: `bloqueios`.
create table public.blocked_dates (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  start_date date not null,
  end_date date not null,
  all_day boolean not null default true,
  start_time time not null default '12:00',
  end_time time not null default '13:00',
  reason text not null default '',             -- nunca exposto ao público (ver security)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocked_dates_range check (end_date >= start_date),
  constraint blocked_dates_time_range check (all_day or start_time < end_time)
);
create index blocked_dates_period_idx on public.blocked_dates (start_date, end_date);

-- Legado: `portfolio` (a ordem era a posição no array).
create table public.portfolio (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  image_url text not null,                     -- URL pública (Storage ou externa)
  caption text not null default '',
  instagram_url text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Legado: `depoimentos` (textos). Nota e total de avaliações ficam em business_settings.
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  legacy_index integer unique,
  body text not null,
  author_name text,
  rating smallint,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_body check (length(btrim(body)) > 0),
  constraint reviews_rating check (rating is null or rating between 1 and 5)
);

-- ---------------------------------------------------------------------------
-- Agendamentos
-- ---------------------------------------------------------------------------

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  public_code text not null,
  service_id uuid references public.services (id) on delete set null,
  -- Cópia do serviço no momento da reserva: o histórico não muda se o serviço for editado/excluído.
  service_name text not null,
  price_cents integer,
  price_label text,
  customer_name text not null,
  customer_phone text not null,                -- como o cliente digitou
  customer_phone_digits text not null,         -- normalizado (sem 55); chave de busca
  appointment_date date not null,
  start_time time not null,
  end_time time not null,
  time_range tsrange generated always as (
    tsrange(appointment_date + start_time, appointment_date + end_time, '[)')
  ) stored,
  status text not null default 'pendente',
  payment_method text not null,
  notes text not null default '',
  source text not null default 'site',
  access_token_hash bytea,                     -- sha256 do token do aparelho do cliente
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint appointments_public_code_key unique (public_code),
  constraint appointments_public_code_format check (public_code ~ '^DB-[0-9A-Z]{4,12}$'),
  constraint appointments_customer_name check (length(btrim(customer_name)) between 1 and 120),
  constraint appointments_phone_digits check (customer_phone_digits ~ '^[0-9]{10,11}$'),
  constraint appointments_time_order check (end_time > start_time),
  constraint appointments_status check (
    status in ('pendente', 'confirmado', 'reagendamento', 'concluido', 'recusado', 'cancelado')
  ),
  constraint appointments_payment check (payment_method in ('PIX', 'CARTÃO', 'DINHEIRO')),
  constraint appointments_notes check (length(notes) <= 1000),
  constraint appointments_source check (source in ('site', 'admin', 'legacy_import')),
  constraint appointments_price check (price_cents is null or price_label is null),
  -- ANTI-DOUBLE-BOOKING: dois agendamentos ativos nunca podem ter intervalos que se cruzam.
  -- '[)' inclui o início e exclui o fim, então 10:00–10:30 e 10:30–11:00 convivem.
  -- Status fora de ('pendente','confirmado') não participam: cancelar libera o horário.
  constraint appointments_no_overlap exclude using gist (time_range with &&)
    where (status in ('pendente', 'confirmado'))
);
create index appointments_phone_idx on public.appointments (customer_phone_digits);
create index appointments_date_idx on public.appointments (appointment_date);
create index appointments_token_idx on public.appointments (access_token_hash) where access_token_hash is not null;

-- Histórico de mudanças de status (auditoria).
create table public.appointment_status_history (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid default auth.uid(),          -- usuário do Admin; null = cliente/sistema
  changed_at timestamptz not null default now()
);
create index appointment_status_history_appointment_idx on public.appointment_status_history (appointment_id);

create or replace function private.log_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.appointment_status_history (appointment_id, old_status, new_status)
    values (new.id, null, new.status);
  elsif new.status is distinct from old.status then
    insert into public.appointment_status_history (appointment_id, old_status, new_status)
    values (new.id, old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger appointments_log_status
  after insert or update of status on public.appointments
  for each row execute function private.log_appointment_status();

-- updated_at automático
create trigger business_settings_updated_at before update on public.business_settings
  for each row execute function private.set_updated_at();
create trigger business_hours_updated_at before update on public.business_hours
  for each row execute function private.set_updated_at();
create trigger services_updated_at before update on public.services
  for each row execute function private.set_updated_at();
create trigger blocked_dates_updated_at before update on public.blocked_dates
  for each row execute function private.set_updated_at();
create trigger portfolio_updated_at before update on public.portfolio
  for each row execute function private.set_updated_at();
create trigger reviews_updated_at before update on public.reviews
  for each row execute function private.set_updated_at();
create trigger appointments_updated_at before update on public.appointments
  for each row execute function private.set_updated_at();
