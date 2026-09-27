-- Dhow Barber — segurança (Fase 1): Admin via Supabase Auth, RLS e privilégios.
--
-- Papéis do Supabase:
--   anon           visitante do site (chave pública). Só lê o catálogo público e chama as RPCs do cliente.
--   authenticated  usuário logado. Só quem está em private.admin_users tem poderes de Admin.
--   service_role   uso administrativo fora do navegador (importação). Nunca vai para o frontend.
--
-- Não existe senha no banco: o login do barbeiro é do Supabase Auth (cadastro público desligado).

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create table private.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from private.admin_users where user_id = auth.uid());
$$;

-- As políticas de RLS rodam com o papel de quem consulta: precisam de acesso a private.is_admin().
grant usage on schema private to anon, authenticated;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;
revoke all on function private.normalize_phone_digits(text) from public;
revoke all on function private.set_updated_at() from public;
revoke all on function private.log_appointment_status() from public;
revoke all on table private.admin_users from public, anon, authenticated;

-- Permite ao Admin React saber se o usuário logado é admin.
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.is_admin();
$$;
revoke all on function public.current_user_is_admin() from public, anon, authenticated;
grant execute on function public.current_user_is_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS em todas as tabelas expostas
-- ---------------------------------------------------------------------------

alter table public.business_settings enable row level security;
alter table public.business_hours enable row level security;
alter table public.services enable row level security;
alter table public.blocked_dates enable row level security;
alter table public.portfolio enable row level security;
alter table public.reviews enable row level security;
alter table public.appointments enable row level security;
alter table public.appointment_status_history enable row level security;

-- O Supabase concede tudo a anon/authenticated por padrão; recomeçamos do zero
-- e concedemos só o necessário. O RLS continua sendo a barreira de linhas.
revoke all on table
  public.business_settings, public.business_hours, public.services, public.blocked_dates,
  public.portfolio, public.reviews, public.appointments, public.appointment_status_history
  from anon, authenticated;

-- Configuração, horários, serviços, portfólio e avaliações: leitura pública; escrita só do Admin.
grant select on public.business_settings, public.business_hours, public.services,
  public.portfolio, public.reviews to anon, authenticated;
grant update on public.business_settings to authenticated;
grant insert, update, delete on public.business_hours, public.services,
  public.portfolio, public.reviews to authenticated;

create policy business_settings_read on public.business_settings
  for select to anon, authenticated using (true);
create policy business_settings_admin_update on public.business_settings
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create policy business_hours_read on public.business_hours
  for select to anon, authenticated using (true);
create policy business_hours_admin_write on public.business_hours
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy services_read on public.services
  for select to anon, authenticated using (active or private.is_admin());
create policy services_admin_write on public.services
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy portfolio_read on public.portfolio
  for select to anon, authenticated using (active or private.is_admin());
create policy portfolio_admin_write on public.portfolio
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create policy reviews_read on public.reviews
  for select to anon, authenticated using (active or private.is_admin());
create policy reviews_admin_write on public.reviews
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Bloqueios: o público vê quando está fechado, mas não o motivo (pode ser pessoal).
grant select (id, start_date, end_date, all_day, start_time, end_time) on public.blocked_dates to anon;
grant select, insert, update, delete on public.blocked_dates to authenticated;
create policy blocked_dates_read on public.blocked_dates
  for select to anon, authenticated using (true);
create policy blocked_dates_admin_write on public.blocked_dates
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- Agendamentos: NENHUM acesso direto do público. Clientes usam só as RPCs
-- (create_appointment, get_busy_intervals, get_client_appointments…), que
-- devolvem apenas o que cada um pode ver. O Admin lê e exclui; status muda por RPC.
grant select, delete on public.appointments to authenticated;
create policy appointments_admin_read on public.appointments
  for select to authenticated using (private.is_admin());
create policy appointments_admin_delete on public.appointments
  for delete to authenticated using (private.is_admin());

grant select on public.appointment_status_history to authenticated;
create policy appointment_status_history_admin_read on public.appointment_status_history
  for select to authenticated using (private.is_admin());
