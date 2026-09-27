-- pgTAP — RPCs, regras de disponibilidade, token do cliente, status e privilégios.
-- Rodar com `supabase test db`. Tudo acontece numa transação desfeita no final.
-- Valores entre chamadas ficam em GUCs locais (t.*), acessíveis por qualquer papel.
begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

-- ---------------------------------------------------------------------------
-- Preparação (como dono do banco)
-- ---------------------------------------------------------------------------
insert into public.business_settings (id) values (true) on conflict (id) do nothing;
update public.business_settings set
  free_schedule = true, schedule_configured = false, free_start = '08:00', free_end = '20:00',
  slot_interval_minutes = 30, lunch_enabled = true, lunch_start = '12:00', lunch_end = '13:00',
  max_active_bookings_per_phone = null, timezone = 'America/Sao_Paulo';

insert into public.services (id, name, price_cents, duration_minutes, active) values
  ('00000000-0000-0000-0000-0000000000a1', 'Teste 30', 3000, 30, true),
  ('00000000-0000-0000-0000-0000000000a2', 'Teste 60', 5000, 60, true),
  ('00000000-0000-0000-0000-0000000000a3', 'Inativo', 1000, 30, false);

insert into public.blocked_dates (start_date, end_date, all_day, reason)
  values ('2030-01-11', '2030-01-11', true, 'Motivo pessoal');
insert into public.blocked_dates (start_date, end_date, all_day, start_time, end_time, reason)
  values ('2030-01-14', '2030-01-14', false, '15:00', '16:00', 'Consulta');

-- Agendamento importado do legado: sem token do aparelho.
insert into public.appointments (public_code, service_name, customer_name, customer_phone,
  customer_phone_digits, appointment_date, start_time, end_time, payment_method, source)
values ('DB-LEG1', 'Corte', 'Cliente Antigo', '(11) 95555-4444', '11955554444',
  '2030-01-20', '10:00', '10:30', 'PIX', 'legacy_import');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ad01', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000c001', 'outro@test.local');
insert into private.admin_users (user_id) values ('00000000-0000-0000-0000-00000000ad01');

-- ---------------------------------------------------------------------------
-- Visitante (anon): reserva, double booking e cancelamento
-- ---------------------------------------------------------------------------
set local role anon;

select lives_ok($$ select set_config('t.a', public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-10', '10:00', 'Cliente A', '(11) 91234-5678', 'PIX')::text, true) $$, 'A: reserva 10:00–10:30');
select ok(current_setting('t.a')::jsonb ->> 'public_code' ~ '^DB-[0-9A-HJKMNP-TV-Z]{6}$', 'código DB-XXXXXX gerado no servidor');
select ok(current_setting('t.a')::jsonb ->> 'device_token' ~ '^[0-9a-f]{64}$', 'token do aparelho com 64 hex');
select is(current_setting('t.a')::jsonb ->> 'end_time', '10:30', 'fim calculado pela duração do serviço no banco');
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('t.a')::jsonb) as k),
  array['appointment_date', 'device_token', 'end_time', 'id', 'public_code', 'service_name', 'start_time', 'status'],
  'create_appointment devolve só os campos necessários');

select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a2',
  '2030-01-10', '09:30', 'Cliente B', '(11) 92222-3333', 'PIX') $$,
  'P0001', 'SLOT_TAKEN', 'B: 09:30–10:30 cruza 10:00–10:30 e é recusado');
select lives_ok($$ select set_config('t.c', public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-10', '10:30', 'Cliente C', '(11) 91234-5678', 'PIX')::text, true) $$, 'C: 10:30–11:00 consecutivo é aceito');

select is(public.cancel_client_appointment(current_setting('t.a')::jsonb ->> 'public_code',
  current_setting('t.a')::jsonb ->> 'device_token') ->> 'ok', 'true', 'cliente cancela A com o token');
select lives_ok($$ select set_config('t.d', public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-10', '10:00', 'Cliente D', '(11) 93333-4444', 'CARTÃO')::text, true) $$,
  'D: 10:00–10:30 reutilizado após o cancelamento');
select is((select array_agg(start_time::text || '-' || end_time::text) from public.get_busy_intervals('2030-01-10')),
  array['10:00:00-10:30:00', '10:30:00-11:00:00'], 'horários ocupados: só ativos, sem dados pessoais');

-- ---------------------------------------------------------------------------
-- Regras de disponibilidade no servidor
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2020-01-06', '10:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'data passada é recusada');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-15', '12:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'horário de almoço é recusado');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a2',
  '2030-01-15', '11:30', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'serviço que invade o almoço é recusado');
select lives_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-15', '13:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'logo após o almoço é aceito');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-11', '10:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'dia bloqueado é recusado');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-14', '15:30', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'faixa bloqueada é recusada');
select lives_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-14', '16:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'logo após a faixa bloqueada é aceito');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a2',
  '2030-01-15', '19:30', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'terminar depois do fechamento é recusado');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-15', '07:30', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'antes da abertura é recusado');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-15', '10:10', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'fora da grade de horários é recusado');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a3',
  '2030-01-15', '10:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SERVICE_UNAVAILABLE', 'serviço inativo é recusado');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-15', '10:00', 'Cliente', '(11) 91234-5678', 'BOLETO') $$, 'P0001', 'INVALID_PAYMENT', 'forma de pagamento inválida');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-15', '10:00', 'A', '(11) 91234-5678', 'PIX') $$, 'P0001', 'INVALID_CUSTOMER', 'nome curto é recusado');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-15', '10:00', 'Cliente', '1234', 'PIX') $$, 'P0001', 'INVALID_CUSTOMER', 'telefone sem DDD é recusado');

-- ---------------------------------------------------------------------------
-- Token do aparelho, telefone + código e freio de tentativas
-- ---------------------------------------------------------------------------
select lives_ok($$ select set_config('t.e', public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-16', '09:00', 'Cliente E', '+55 (11) 98888-7777', 'PIX')::text, true) $$, 'reserva com DDI +55');
select is((select count(*)::integer from public.get_client_appointment_by_code('11988887777',
  current_setting('t.e')::jsonb ->> 'public_code')), 1, 'telefone normalizado: +55 e máscara são removidos');
select is((select count(*)::integer from public.get_client_appointment_by_code('(11) 98888-7777',
  '  ' || lower(current_setting('t.e')::jsonb ->> 'public_code') || ' ')), 1, 'código aceita minúsculas e espaços');
select is((select count(*)::integer from public.get_client_appointment_by_code('11900001111',
  current_setting('t.e')::jsonb ->> 'public_code')), 0, 'código com outro telefone não devolve nada');
select is(public.create_appointment('00000000-0000-0000-0000-0000000000a1', '2030-01-16', '09:30', 'Cliente E',
  '11988887777', 'PIX', '', current_setting('t.e')::jsonb ->> 'device_token') ->> 'device_token',
  current_setting('t.e')::jsonb ->> 'device_token', 'o aparelho reaproveita o próprio token');
select is((select count(*)::integer from public.get_client_appointments(current_setting('t.e')::jsonb ->> 'device_token')),
  2, 'token lista só as reservas feitas com ele');
select is((select count(*)::integer from public.get_client_appointments(current_setting('t.a')::jsonb ->> 'device_token')),
  1, 'outro token vê só a própria reserva');
select is((select count(*)::integer from public.get_client_appointments('token-invalido')), 0, 'token inválido não vê nada');
select is((select count(*)::integer from public.get_client_appointments(null)), 0, 'sem token não vê nada');

select is(public.cancel_client_appointment(current_setting('t.c')::jsonb ->> 'public_code', null, '(11) 90000-9999') ->> 'error',
  'APPOINTMENT_NOT_FOUND', 'cancelar com telefone errado é recusado');
select is(public.cancel_client_appointment(current_setting('t.c')::jsonb ->> 'public_code', null, '11912345678') ->> 'ok',
  'true', 'cancelar com telefone + código funciona');
select is(public.cancel_client_appointment(current_setting('t.c')::jsonb ->> 'public_code', null, '11912345678') ->> 'error',
  'NOT_CANCELLABLE', 'não cancela duas vezes');
select is(public.cancel_client_appointment('DB-LEG1', repeat('a', 64)) ->> 'error', 'APPOINTMENT_NOT_FOUND',
  'token qualquer não cancela agendamento importado sem token');
select is(public.cancel_client_appointment('DB-LEG1') ->> 'error', 'APPOINTMENT_NOT_FOUND', 'sem prova nenhuma não cancela');

select is((select count(*)::integer from generate_series(1, 10) as attempt,
  lateral public.get_client_appointment_by_code('11977776666', 'DB-ZZZZZ' || attempt::text)), 0, '10 tentativas erradas');
select throws_ok($$ select * from public.get_client_appointment_by_code('11977776666', 'DB-ZZZZZZ') $$,
  'P0001', 'TOO_MANY_ATTEMPTS', 'a 11ª tentativa na mesma hora é bloqueada');

-- ---------------------------------------------------------------------------
-- Privilégios do visitante
-- ---------------------------------------------------------------------------
select throws_ok($$ select count(*) from public.appointments $$, '42501', null, 'anon: sem SELECT em appointments');
select throws_ok($$ select access_token_hash from public.appointments $$, '42501', null, 'anon: não lê access_token_hash');
select throws_ok($$ select customer_phone from public.appointments $$, '42501', null, 'anon: não lista clientes');
select throws_ok($$ select * from private.admin_users $$, '42501', null, 'anon: não lê private.admin_users');
select throws_ok($$ select * from private.client_lookup_attempts $$, '42501', null, 'anon: não lê tentativas');
select throws_ok($$ select * from public.appointment_status_history $$, '42501', null, 'anon: não lê histórico');
select throws_ok($$ select reason from public.blocked_dates $$, '42501', null, 'anon: não lê o motivo do bloqueio');
select lives_ok($$ select id, start_date, end_date, all_day, start_time, end_time from public.blocked_dates $$,
  'anon: lê quando está fechado');
select throws_ok($$ update public.business_settings set name = 'x' $$, '42501', null, 'anon: não altera configurações');
select throws_ok($$ insert into public.services (name) values ('x') $$, '42501', null, 'anon: não cria serviço');
select throws_ok($$ select public.admin_set_appointment_status(gen_random_uuid(), 'confirmado') $$,
  '42501', null, 'anon: não executa função de Admin');
select throws_ok($$ select private.generate_public_code() $$, '42501', null, 'anon: não executa funções internas');
select ok(not exists (select 1 from public.services where name = 'Inativo'), 'anon: só vê serviços ativos');

select is(pg_get_function_result('public.get_client_appointments(text)'::regprocedure),
  'TABLE(public_code text, service_name text, appointment_date date, start_time time without time zone, end_time time without time zone, status text, payment_method text, notes text, customer_name text, customer_phone text, price_cents integer, price_label text)',
  'consulta por token não expõe id, token ou dados internos');
select is(pg_get_function_result('public.get_client_appointment_by_code(text,text)'::regprocedure),
  pg_get_function_result('public.get_client_appointments(text)'::regprocedure), 'consulta por código devolve os mesmos campos');
select is(pg_get_function_result('public.get_busy_intervals(date)'::regprocedure),
  'TABLE(start_time time without time zone, end_time time without time zone)', 'horários ocupados só com início e fim');

-- ---------------------------------------------------------------------------
-- Usuário autenticado que não é Admin
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c001","role":"authenticated"}', true);

select is(public.current_user_is_admin(), false, 'usuário comum não é Admin');
select is((select count(*)::integer from public.appointments), 0, 'usuário comum não vê agendamentos (RLS)');
select throws_ok($$ select public.admin_set_appointment_status((current_setting('t.e')::jsonb ->> 'id')::uuid, 'confirmado') $$,
  'P0001', 'NOT_ADMIN', 'usuário comum não muda status');
select throws_ok($$ update public.appointments set status = 'confirmado' $$, '42501', null,
  'ninguém altera agendamentos direto na tabela');

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad01","role":"authenticated"}', true);

select is(public.current_user_is_admin(), true, 'Admin reconhecido por private.admin_users');
select ok((select count(*) from public.appointments) > 0, 'Admin vê os agendamentos');
select lives_ok($$ select public.admin_set_appointment_status((current_setting('t.e')::jsonb ->> 'id')::uuid, 'confirmado') $$,
  'Admin confirma (pendente → confirmado)');
select throws_ok($$ select public.admin_set_appointment_status((current_setting('t.e')::jsonb ->> 'id')::uuid, 'pendente') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'transição fora do fluxo legado é recusada');
select lives_ok($$ select public.admin_set_appointment_status((current_setting('t.e')::jsonb ->> 'id')::uuid, 'concluido') $$,
  'Admin conclui (confirmado → concluído)');
select is((select array_agg(coalesce(old_status, '-') || '>' || new_status order by id) from public.appointment_status_history
  where appointment_id = (current_setting('t.e')::jsonb ->> 'id')::uuid),
  array['->pendente', 'pendente>confirmado', 'confirmado>concluido'], 'histórico registra cada mudança');
select is((select changed_by from public.appointment_status_history
  where appointment_id = (current_setting('t.e')::jsonb ->> 'id')::uuid and new_status = 'concluido'),
  '00000000-0000-0000-0000-00000000ad01'::uuid, 'histórico registra qual Admin mudou');
select throws_ok($$ select public.admin_set_appointment_status((current_setting('t.a')::jsonb ->> 'id')::uuid, 'pendente') $$,
  'P0001', 'SLOT_TAKEN', 'Admin não reabre A: o horário 10:00 já é de D');

-- ---------------------------------------------------------------------------
-- Antecedência mínima e grade semanal
-- ---------------------------------------------------------------------------
reset role;
update public.business_settings set slot_interval_minutes = 10, free_start = '00:00', free_end = '23:50', lunch_enabled = false;
select set_config('t.soon', (date_bin('10 minutes', now() at time zone 'America/Sao_Paulo', timestamp '2000-01-01')
  + interval '10 minutes')::text, true);
set local role anon;
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  current_setting('t.soon')::timestamp::date, current_setting('t.soon')::timestamp::time, 'Cliente', '(11) 91234-5678', 'PIX') $$,
  'P0001', 'SLOT_UNAVAILABLE', 'menos de 15 minutos de antecedência é recusado');

reset role;
update public.business_settings set free_schedule = false, schedule_configured = true, slot_interval_minutes = 30;
update public.business_hours set is_open = (weekday = 3), open_time = '09:00', close_time = '18:00';
set local role anon;
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-17', '10:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'P0001', 'SLOT_UNAVAILABLE', 'grade semanal: quinta fechada');
select lives_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000a1',
  '2030-01-23', '09:00', 'Cliente', '(11) 91234-5678', 'PIX') $$, 'grade semanal: quarta aberta às 09:00');

reset role;
select * from finish();
rollback;
