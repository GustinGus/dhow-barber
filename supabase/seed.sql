-- Dados iniciais SOMENTE para desenvolvimento local (`supabase db reset`).
-- São os mesmos padrões do seed() do legado, sem senha. Produção recebe os dados
-- reais pela importação do backup do Admin (supabase/docs/legacy-import.md).

insert into public.business_settings (
  id, name, address_line, neighborhood, city, postal_code,
  phone_display, phone_e164, whatsapp_number, instagram_url,
  booking_channel, booking_channel_url, rating_display, review_count,
  free_schedule, free_start, free_end, schedule_configured, slot_interval_minutes,
  lunch_enabled, lunch_start, lunch_end
) values (
  true, 'Dhow Barber', 'R. Profa. Olga Nilza Dos Santos Machado, 24', 'Vista Alegre', 'Jundiaí - SP', '13214-442',
  '(11) 94146-5958', '+5511941465958', '5511941465958', 'https://www.instagram.com/dhowbarber_/',
  'whatsapp', '', '5,0', 42,
  true, '08:00', '20:00', false, 30,
  false, '12:00', '13:00'
);

insert into public.business_hours (weekday, is_open, open_time, close_time)
select weekday, false, '09:00', '19:00' from generate_series(0, 6) as weekday;

insert into public.services (legacy_id, name, price_cents, price_label, duration_minutes, sort_order) values
  ('s1', 'Corte de cabelo', 4000, null, null, 1),
  ('s2', 'Corte + Sobrancelha', 4500, null, null, 2),
  ('s3', 'Barba', 2500, null, null, 3),
  ('s4', 'Corte + Barba', 6000, null, null, 4),
  ('s5', 'Sobrancelha', 500, null, null, 5),
  ('s6', 'Coloração', null, 'Verificar com o Dhow', null, 6);

insert into public.reviews (legacy_index, body, sort_order) values
  (0, 'Lugar otimo, gente fina e faz cabelo piscina', 0),
  (1, 'Tem cafezinho e massagem, show de bola!', 1),
  (2, 'Ótimo profissional, super recomendo!', 2);
