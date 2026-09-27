# Supabase — Dhow Barber

Schema e regras do banco online que vai substituir o `localStorage` (`dhow_barber_db_v1`).

> **Estado:** Fase 1. Nenhum projeto Supabase remoto foi criado ou conectado, e o app continua
> usando apenas o repositório local (`src/lib/data/local-repository.ts`). As migrations foram
> validadas só no Supabase **local** (CLI 2.118.0, Postgres 17.6): aplicam do zero e passam nos
> 87 testes pgTAP de `tests/database/`.

## Arquivos

```
supabase/
  migrations/
    20260927180000_base_schema.sql        tabelas, constraints, índices, triggers
    20260927180100_security.sql           Admin (Supabase Auth), RLS e privilégios
    20260927180200_booking_functions.sql  RPCs de agendamento, código público, consultas do cliente
  seed.sql                                padrões do legado, só para desenvolvimento local
  tests/database/appointments.test.sql    pgTAP (16): double booking, código público, acesso anônimo
  tests/database/rpc_security.test.sql    pgTAP (71): RPCs, disponibilidade, token, status, privilégios
  docs/legacy-import.md                   conversão do backup do Admin antigo para este schema
  config.toml                             configuração do stack LOCAL, gerada por `supabase init`
```

Estrutura padrão do Supabase CLI. `config.toml` só descreve o ambiente local; os segredos
dele são referências `env(...)`, nunca valores.

## Tabelas

| Tabela | Origem no legado | Acesso público (`anon`) |
|---|---|---|
| `business_settings` (linha única) | `config` + campos globais de `horarios` | leitura |
| `business_hours` (7 linhas) | `horarios.dias` | leitura |
| `services` | `servicos` | leitura dos ativos |
| `blocked_dates` | `bloqueios` | leitura **sem** `reason` |
| `portfolio` | `portfolio` | leitura dos ativos |
| `reviews` | `depoimentos` | leitura dos ativos |
| `appointments` | `agendamentos` | **nenhum** — só via RPC |
| `appointment_status_history` | — (novo, auditoria) | nenhum |
| `private.admin_users` | — (substitui `config.senha`) | nenhum |
| `private.client_lookup_attempts` | — (freio de tentativas) | nenhum |

Status preservados do legado: `pendente`, `confirmado`, `reagendamento`, `concluido`, `recusado`, `cancelado`.

## Anti-double-booking

```sql
time_range tsrange generated always as
  (tsrange(appointment_date + start_time, appointment_date + end_time, '[)')) stored,
constraint appointments_no_overlap exclude using gist (time_range with &&)
  where (status in ('pendente', 'confirmado'))
```

- `time_range` é calculado pelo banco a partir da data e dos horários; ninguém escreve nele.
- A constraint de exclusão diz: **não podem existir duas linhas cujos `time_range` se sobreponham (`&&`)**,
  considerando só as linhas com status `pendente` ou `confirmado`.
- `'[)'` inclui o início e exclui o fim: 10:00–10:30 e 10:30–11:00 **não** se sobrepõem.
- Cancelado, recusado, concluído e reagendamento ficam fora do `where`: cancelar libera o horário.
- É **atômica**: o Postgres checa usando o índice GiST da própria constraint no momento do
  `insert`/`update`. Se duas transações tentam intervalos que se cruzam ao mesmo tempo, a segunda
  **espera** a primeira terminar; se a primeira confirmar, a segunda falha com `23P01`
  (`exclusion_violation`). Não existe janela entre "consultar" e "inserir".
- Vale também para o Admin: reabrir ou confirmar um agendamento num horário já ocupado falha.
- A duração vem do serviço no banco (`create_appointment`), não do navegador.
- Horário local sem fuso é intencional: uma única barbearia, e o Brasil não tem horário de verão.
- Para vários barbeiros no futuro: coluna `barber_id` + `exclude using gist (barber_id with =, time_range with &&)`
  com a extensão `btree_gist`. Hoje ela não é necessária.

## Código público (`DB-XXXXXX`)

- Gerado **no servidor** por `private.generate_public_code()`: `DB-` + 6 caracteres do alfabeto
  Crockford base32 (`0-9 A-Z` sem `I L O U`, sem confusão visual), bytes de `gen_random_bytes`.
- 32⁶ ≈ 1,07 bilhão de combinações (o legado tinha 36⁴ ≈ 1,7 milhão, sem checar repetição).
- Unicidade garantida pela constraint `appointments_public_code_key`; em caso de colisão,
  `create_appointment` sorteia outro (até 5 vezes).
- Compatibilidade: códigos antigos de 4 caracteres (`DB-A1B2`) são importados como estão;
  o formato aceito é `^DB-[0-9A-Z]{4,12}$`. Mesmo visual, só mais longo.
- Não é sequencial de propósito: o código é parte da prova de acesso em outro aparelho.

## Acesso do cliente

A tabela `appointments` não tem privilégio para `anon`. O cliente usa só funções
`SECURITY DEFINER` com `search_path` vazio:

| Função | O que faz | Prova exigida |
|---|---|---|
| `get_busy_intervals(date)` | intervalos ocupados do dia, sem dados pessoais | nenhuma |
| `create_appointment(...)` | valida regras e grava; devolve `public_code` e `device_token` | nenhuma |
| `get_client_appointments(token)` | agendamentos criados com o token do aparelho | token |
| `get_client_appointment_by_code(phone, code)` | aquele único agendamento | telefone + código |
| `cancel_client_appointment(code, token, phone)` | cancela se `pendente`/`confirmado` | token **ou** telefone, sempre com o código |

- **Token do aparelho:** 32 bytes aleatórios (64 hex), devolvido uma vez; o banco guarda só o `sha256`.
  O aparelho reenvia o token nas próximas reservas, então todas ficam ligadas a ele.
- **Só o telefone não dá acesso a nada.** Senão, quem digitasse o número de outra pessoa veria os
  horários dela. Listar tudo por telefone exigiria confirmar a posse do número (código por
  WhatsApp/SMS), que fica para uma fase futura.
- **Freio de tentativas:** 10 falhas de telefone + código por hora e por telefone bloqueiam novas tentativas.
  Falhas respondem igual para "não existe" e "não é seu".
- Limite opcional de reservas em aberto por telefone: `business_settings.max_active_bookings_per_phone`
  (desligado por padrão, como hoje).

## Admin

- Login pelo **Supabase Auth** (e-mail e senha), com cadastro público **desligado**.
- É admin quem está em `private.admin_users`, que só é preenchida manualmente (SQL Editor ou `service_role`).
- `private.is_admin()` alimenta as políticas de RLS; `current_user_is_admin()` permite ao frontend saber se é admin.
- Agendamentos: o Admin lê e exclui diretamente; status muda só por `admin_set_appointment_status`,
  com as mesmas transições do painel legado, registradas em `appointment_status_history`.
- A senha do painel legado **não** existe no banco nem em variáveis. Nada vai em `VITE_` além
  da URL do projeto e da chave `anon` (pública por natureza, segura só com RLS).
  A chave `service_role` nunca entra no frontend nem no Git.

## Como testar localmente

Requer Docker Desktop rodando. O CLI roda via `npx`, sem instalação global. Tudo é local:
nunca use `link`, `--linked` ou `db push` sem autorização.

```bash
# Stack mínimo: só Postgres + Auth (o schema auth completo é necessário)
npx supabase start -x realtime,storage-api,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
npx supabase db reset --local   # recria o banco local: migrations + seed.sql
npx supabase test db            # roda os testes pgTAP de tests/database/
npx supabase stop               # desliga o stack local
```

As chaves que o `start` imprime são as de demonstração do Supabase local (iguais em qualquer
máquina, válidas só em 127.0.0.1). Não copie para arquivos nem use fora do ambiente local.

Um Postgres "puro" não serve sem adaptações: falta o schema `auth`, `auth.uid()` e os papéis do Supabase.
