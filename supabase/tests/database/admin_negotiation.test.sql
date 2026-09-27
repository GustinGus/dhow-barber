-- pgTAP — status "negociando", transições do Admin, histórico com nota e data/horário,
-- privilégios do Admin e cancelamento pelo cliente. Tudo é desfeito no ROLLBACK.
begin;
create extension if not exists pgtap with schema extensions;
select plan(55);

-- ---------------------------------------------------------------------------
-- Preparação (dono do banco)
-- ---------------------------------------------------------------------------
insert into public.business_settings (id) values (true) on conflict (id) do nothing;
update public.business_settings set
  free_schedule = true, schedule_configured = false, free_start = '08:00', free_end = '20:00',
  slot_interval_minutes = 30, lunch_enabled = false, max_active_bookings_per_phone = null,
  timezone = 'America/Sao_Paulo';

insert into public.services (id, name, price_cents, duration_minutes, active)
  values ('00000000-0000-0000-0000-0000000000b1', 'Teste negociação', 3000, 30, true);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000ad02', 'admin-negociacao@test.local'),
  ('00000000-0000-0000-0000-00000000c002', 'comum-negociacao@test.local');
insert into private.admin_users (user_id) values ('00000000-0000-0000-0000-00000000ad02');

create function pg_temp.appt(p_id uuid, p_code text, p_date date, p_start time, p_end time, p_status text,
  p_phone text default '11911110000', p_token text default null)
returns void language sql as $$
  insert into public.appointments (id, public_code, service_name, customer_name, customer_phone,
    customer_phone_digits, appointment_date, start_time, end_time, status, payment_method, access_token_hash)
  values (p_id, p_code, 'Teste', 'Cliente Negociação', p_phone, p_phone, p_date, p_start, p_end, p_status, 'PIX',
    case when p_token is null then null else extensions.digest(p_token, 'sha256') end);
$$;

-- ---------------------------------------------------------------------------
-- 1) Status
-- ---------------------------------------------------------------------------
select lives_ok($$ select pg_temp.appt('00000000-0000-0000-0000-00000000e001', 'DB-NEG001', '2030-03-05', '10:00', '10:30', 'negociando') $$,
  'status negociando é aceito');
select throws_ok($$ select pg_temp.appt(gen_random_uuid(), 'DB-NEG099', '2030-03-05', '15:00', '15:30', 'em_espera') $$,
  '23514', null, 'status desconhecido continua recusado');
select lives_ok($$ select pg_temp.appt('00000000-0000-0000-0000-00000000e0a1', 'DB-LEGRE1', '2030-03-06', '10:00', '10:30', 'reagendamento') $$,
  'reagendamento (legado) continua aceito');
select lives_ok($$ select pg_temp.appt('00000000-0000-0000-0000-00000000e0a2', 'DB-LEGRC1', '2030-03-06', '10:00', '10:30', 'recusado') $$,
  'recusado (legado) continua aceito e não ocupa horário');

-- ---------------------------------------------------------------------------
-- 2) "negociando" reserva o horário
-- ---------------------------------------------------------------------------
select throws_ok($$ select pg_temp.appt(gen_random_uuid(), 'DB-NEG002', '2030-03-05', '10:15', '10:45', 'pendente') $$,
  '23P01', null, 'pendente por cima de negociando é recusado');
select lives_ok($$ select pg_temp.appt('00000000-0000-0000-0000-00000000e003', 'DB-NEG003', '2030-03-05', '10:30', '11:00', 'pendente', '11933330000') $$,
  'horário consecutivo a negociando é permitido');

set local role anon;
select is((select array_agg(start_time::text || '-' || end_time::text) from public.get_busy_intervals('2030-03-05')),
  array['10:00:00-10:30:00', '10:30:00-11:00:00'], 'horários ocupados incluem negociando');
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000b1',
  '2030-03-05', '10:00', 'Cliente Novo', '(11) 94444-5555', 'PIX') $$,
  'P0001', 'SLOT_TAKEN', 'reserva pelo site no horário em negociação é recusada');
reset role;

update public.business_settings set max_active_bookings_per_phone = 1;
set local role anon;
select throws_ok($$ select public.create_appointment('00000000-0000-0000-0000-0000000000b1',
  '2030-03-07', '10:00', 'Cliente Negociação', '11911110000', 'PIX') $$,
  'P0001', 'TOO_MANY_ACTIVE_BOOKINGS', 'limite por telefone conta negociando');
reset role;
update public.business_settings set max_active_bookings_per_phone = null;

-- ---------------------------------------------------------------------------
-- 3) Transições do Admin
-- ---------------------------------------------------------------------------
select pg_temp.appt('00000000-0000-0000-0000-00000000f001', 'DB-TRN001', '2030-03-10', '09:00', '09:30', 'pendente');
select pg_temp.appt('00000000-0000-0000-0000-00000000f002', 'DB-TRN002', '2030-03-10', '10:00', '10:30', 'pendente');
select pg_temp.appt('00000000-0000-0000-0000-00000000f003', 'DB-TRN003', '2030-03-10', '11:00', '11:30', 'pendente');
select pg_temp.appt('00000000-0000-0000-0000-00000000f004', 'DB-TRN004', '2030-03-10', '12:00', '12:30', 'negociando');
select pg_temp.appt('00000000-0000-0000-0000-00000000f005', 'DB-TRN005', '2030-03-10', '13:00', '13:30', 'confirmado');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000ad02","role":"authenticated"}', true);

select lives_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f001', 'negociando') $$, 'pendente → negociando');
select lives_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f001', 'confirmado') $$, 'negociando → confirmado');
select lives_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f001', 'negociando') $$, 'confirmado → negociando');
select lives_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f001', 'cancelado') $$, 'negociando → cancelado');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f001', 'pendente') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'cancelado é final (sem reabrir)');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f001', 'confirmado') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'cancelado não volta para confirmado');

select lives_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f002', 'confirmado') $$, 'pendente → confirmado');
select lives_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f002', 'concluido') $$, 'confirmado → concluido');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f002', 'cancelado') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'concluido é final');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f002', 'negociando') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'concluido não vai para negociando');

select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f003', 'concluido') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'pendente não pula para concluido');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f003', 'reagendamento') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'Admin não oferece reagendamento');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f003', 'recusado') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'Admin não oferece recusado');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f003', 'pendente') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'pendente → pendente não é transição');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f003', null) $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'status nulo é recusado');
select lives_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f003', 'cancelado') $$, 'pendente → cancelado');

select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f004', 'pendente') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'negociando não volta para pendente');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f004', 'concluido') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'negociando não pula para concluido');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f005', 'pendente') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'confirmado não volta para pendente');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000e0a1', 'confirmado') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'reagendamento (legado) sem transições no Admin');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000e0a2', 'pendente') $$,
  'P0001', 'INVALID_STATUS_TRANSITION', 'recusado (legado) sem transições no Admin');
select throws_ok($$ select public.admin_set_appointment_status(gen_random_uuid(), 'confirmado') $$,
  'P0001', 'APPOINTMENT_NOT_FOUND', 'agendamento inexistente');
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f005', 'negociando', repeat('x', 501)) $$,
  'P0001', 'INVALID_NOTE', 'nota com mais de 500 caracteres é recusada');

select set_config('t.r', public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f005', 'negociando',
  '  Cliente pediu outro dia  ')::text, true);
select is((select array_agg(k order by k) from jsonb_object_keys(current_setting('t.r')::jsonb) as k),
  array['id', 'public_code', 'status'], 'retorno do Admin só com id, código e status (sem access_token_hash)');

-- ---------------------------------------------------------------------------
-- 4) Privilégios do Admin
-- ---------------------------------------------------------------------------
select throws_ok($$ select access_token_hash from public.appointments $$, '42501', null, 'Admin não lê access_token_hash');
select throws_ok($$ select * from public.appointments $$, '42501', null, 'select * falha: o hash não está entre as colunas liberadas');
select ok((select count(public_code) from public.appointments) > 0, 'Admin lê as colunas explícitas');
select lives_ok($$ delete from public.appointments where id = '00000000-0000-0000-0000-00000000f003' $$, 'Admin exclui (RLS)');
select is((select count(id)::integer from public.appointments where id = '00000000-0000-0000-0000-00000000f003'), 0,
  'registro excluído pelo Admin sumiu');
select throws_ok($$ update public.appointments set notes = 'x' $$, '42501', null, 'Admin não altera a tabela diretamente');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000c002","role":"authenticated"}', true);
select throws_ok($$ select public.admin_set_appointment_status('00000000-0000-0000-0000-00000000f004', 'confirmado') $$,
  'P0001', 'NOT_ADMIN', 'usuário comum não muda status');
select is((select count(id)::integer from public.appointments), 0, 'usuário comum não vê agendamentos (RLS)');
reset role;
-- Fim das sessões autenticadas: sem claims, auth.uid() volta a ser nulo (cliente/sistema).
select set_config('request.jwt.claims', '', true);

set local role anon;
select throws_ok($$ select public.admin_set_appointment_status(gen_random_uuid(), 'confirmado', null) $$,
  '42501', null, 'anon não executa a função de Admin');
reset role;

-- ---------------------------------------------------------------------------
-- 5) Histórico
-- ---------------------------------------------------------------------------
select is((select array_agg(coalesce(old_status, '-') || '>' || new_status order by id) from public.appointment_status_history
  where appointment_id = '00000000-0000-0000-0000-00000000f001'),
  array['->pendente', 'pendente>negociando', 'negociando>confirmado', 'confirmado>negociando', 'negociando>cancelado'],
  'histórico registra cada transição');
select is((select note || '|' || changed_by::text || '|' || old_status || '>' || new_status from public.appointment_status_history
  where appointment_id = '00000000-0000-0000-0000-00000000f005' order by id desc limit 1),
  'Cliente pediu outro dia|00000000-0000-0000-0000-00000000ad02|confirmado>negociando',
  'nota (sem espaços extras) e Admin gravados no histórico');
select ok((select old_start_time is null and new_start_time is null from public.appointment_status_history
  where appointment_id = '00000000-0000-0000-0000-00000000f005' order by id desc limit 1),
  'mudança só de status não preenche data/horário');

update public.appointments set status = 'cancelado' where id = '00000000-0000-0000-0000-00000000f004';
select is((select note from public.appointment_status_history
  where appointment_id = '00000000-0000-0000-0000-00000000f004' order by id desc limit 1), null,
  'a nota não vaza para alterações posteriores');

select pg_temp.appt('00000000-0000-0000-0000-00000000f006', 'DB-TRN006', '2030-03-12', '14:00', '14:30', 'negociando');
update public.appointments set appointment_date = '2030-03-13', start_time = '15:00', end_time = '15:30'
  where id = '00000000-0000-0000-0000-00000000f006';
select is((select concat_ws('|', old_status, new_status, old_appointment_date, old_start_time, old_end_time,
    new_appointment_date, new_start_time, new_end_time)
  from public.appointment_status_history where appointment_id = '00000000-0000-0000-0000-00000000f006' order by id desc limit 1),
  'negociando|negociando|2030-03-12|14:00:00|14:30:00|2030-03-13|15:00:00|15:30:00',
  'mudança de data/horário registra valores antigos e novos');
select throws_ok($$ insert into public.appointment_status_history (appointment_id, new_status, note)
  values ('00000000-0000-0000-0000-00000000f006', 'negociando', repeat('x', 501)) $$,
  '23514', null, 'histórico limita a nota a 500 caracteres');

-- ---------------------------------------------------------------------------
-- 6) Cliente cancela durante a negociação
-- ---------------------------------------------------------------------------
select pg_temp.appt('00000000-0000-0000-0000-00000000c101', 'DB-CLI001', '2030-03-20', '10:00', '10:30', 'negociando', '11955550001', repeat('d', 64));
select pg_temp.appt('00000000-0000-0000-0000-00000000c102', 'DB-CLI002', '2030-03-20', '11:00', '11:30', 'negociando', '11955550002');
select pg_temp.appt('00000000-0000-0000-0000-00000000c103', 'DB-CLI003', '2030-03-20', '12:00', '12:30', 'concluido', '11955550003', repeat('e', 64));

set local role anon;
select is(public.cancel_client_appointment('DB-CLI001', repeat('d', 64)) ->> 'ok', 'true', 'cliente cancela negociando com o token');
select is(public.cancel_client_appointment('DB-CLI002', null, '(11) 95555-0002') ->> 'ok', 'true', 'cliente cancela negociando com telefone + código');
select is(public.cancel_client_appointment('DB-CLI003', repeat('e', 64)) ->> 'error', 'NOT_CANCELLABLE', 'concluido não é cancelável pelo cliente');
reset role;

select lives_ok($$ select pg_temp.appt(gen_random_uuid(), 'DB-CLI004', '2030-03-20', '10:00', '10:30', 'pendente', '11955550004') $$,
  'horário liberado após o cliente cancelar a negociação');
select is((select coalesce(changed_by::text, 'cliente') || '|' || coalesce(note, 'sem nota') || '|' || old_status || '>' || new_status
  from public.appointment_status_history where appointment_id = '00000000-0000-0000-0000-00000000c101' order by id desc limit 1),
  'cliente|sem nota|negociando>cancelado', 'cancelamento do cliente no histórico, sem Admin e sem nota');

-- ---------------------------------------------------------------------------
-- 7) Assinaturas
-- ---------------------------------------------------------------------------
select is(pg_get_function_result('public.admin_set_appointment_status(uuid,text,text)'::regprocedure), 'jsonb',
  'função de Admin devolve jsonb');
select is(to_regprocedure('public.admin_set_appointment_status(uuid,text)'), null, 'assinatura antiga removida');

select * from finish();
rollback;
