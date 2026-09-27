-- pgTAP — regras críticas dos agendamentos. Rodar com `supabase test db` (Postgres local).
-- Tudo acontece numa transação desfeita no final.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.business_settings (id) values (true) on conflict (id) do nothing;
insert into public.services (id, legacy_id, name, price_cents, duration_minutes)
values ('00000000-0000-0000-0000-000000000001', 'test-s1', 'Corte teste', 4000, 30);

-- Insere direto na tabela (como dono), para testar a constraint isoladamente.
create function pg_temp.book(p_code text, p_start time, p_end time, p_status text default 'pendente')
returns void language sql as $$
  insert into public.appointments (public_code, service_name, customer_name, customer_phone,
    customer_phone_digits, appointment_date, start_time, end_time, status, payment_method)
  values (p_code, 'Corte teste', 'Cliente', '(11) 91234-5678', '11912345678',
    '2030-01-10', p_start, p_end, p_status, 'PIX');
$$;

-- 1) Anti-double-booking
select lives_ok($$ select pg_temp.book('DB-T001', '10:00', '10:30') $$, 'primeiro agendamento entra');
select throws_ok($$ select pg_temp.book('DB-T002', '10:00', '10:30') $$, '23P01', null, 'mesmo horário é recusado');
select throws_ok($$ select pg_temp.book('DB-T003', '10:15', '10:45') $$, '23P01', null, 'sobreposição parcial é recusada');
select throws_ok($$ select pg_temp.book('DB-T004', '09:00', '12:00') $$, '23P01', null, 'intervalo que engloba é recusado');
select lives_ok($$ select pg_temp.book('DB-T005', '10:30', '11:00') $$, 'horário consecutivo (10:30) é permitido');
select lives_ok($$ select pg_temp.book('DB-T006', '09:30', '10:00') $$, 'horário consecutivo (termina 10:00) é permitido');
select throws_ok($$ select pg_temp.book('DB-T007', '10:00', '10:30', 'confirmado') $$, '23P01', null, 'confirmado também ocupa');
select lives_ok($$ select pg_temp.book('DB-T008', '10:00', '10:30', 'cancelado') $$, 'registro cancelado não conflita');

update public.appointments set status = 'cancelado' where public_code = 'DB-T001';
select lives_ok($$ select pg_temp.book('DB-T009', '10:00', '10:30') $$, 'após cancelar, o horário pode ser reutilizado');

update public.appointments set status = 'cancelado' where public_code = 'DB-T009';
update public.appointments set status = 'pendente' where public_code = 'DB-T001';
select throws_ok($$ update public.appointments set status = 'pendente' where public_code = 'DB-T008' $$,
  '23P01', null, 'reabrir num horário ocupado é recusado');

-- 2) Código público
select matches(private.generate_public_code(), '^DB-[0-9A-HJKMNP-TV-Z]{6}$', 'código gerado no servidor: DB- + 6 Crockford');
select throws_ok($$ select pg_temp.book('DB-T005', '15:00', '15:30') $$, '23505', null, 'código público é único');
select throws_ok($$ select pg_temp.book('db-x', '16:00', '16:30') $$, '23514', null, 'formato do código é validado');

-- 3) Acesso público (papel anon)
set local role anon;
select throws_ok($$ select count(*) from public.appointments $$, '42501', null, 'anon não lê agendamentos');
select is((select count(*) from public.get_busy_intervals('2030-01-10'))::integer, 3,
  'anon vê só intervalos ocupados');
select throws_ok($$ select public.admin_set_appointment_status(gen_random_uuid(), 'confirmado') $$,
  '42501', null, 'anon não executa função de Admin');
reset role;

select * from finish();
rollback;
