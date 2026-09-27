# Importação do banco legado (`dhow_barber_db_v1`)

Como converter o backup JSON do Admin antigo (**Configurações → Exportar dados**) para o schema
Supabase. **Nada foi importado ainda.** A importação será uma fase própria, com ensaio num projeto
de desenvolvimento antes da produção.

## De onde vêm os dados

Os dados legados vivem no navegador de cada aparelho:

- **Aparelho do barbeiro**: configuração, serviços, horários, bloqueios, portfólio e os agendamentos
  daquele aparelho. É a fonte principal → o barbeiro exporta o backup `.json`.
- **Aparelho de cada cliente**: só os agendamentos feitos ali. Não viram importação em massa: na fase
  de transição, "Meus agendamentos" mostra esses registros locais e oferece enviá-los por
  `create_appointment` (passando pelas mesmas regras e pela constraint).

Nenhuma etapa apaga `dhow_barber_db_v1` do navegador.

## Processo proposto

1. O backup é lido por um script local (Node, fora do navegador) que usa a chave `service_role`
   a partir de variável de ambiente da máquina, **nunca** versionada.
2. O JSON passa por `migrateLegacyDatabase` (mesma migração v1→v2 do site) antes de converter.
   Atenção: backups com `dataVersion < 2` recriam os serviços a partir do padrão; serviços
   criados pelo barbeiro nesse caso seriam perdidos, então o script avisa e para.
3. **Modo simulação** (padrão): valida tudo e gera um relatório sem gravar
   (contagens, IDs sem correspondência, telefones inválidos, sobreposições).
4. **Modo gravação**: tudo numa transação; qualquer erro desfaz tudo. Reexecutar é seguro:
   as linhas são casadas pelos `legacy_id` (upsert), sem duplicar.
5. Conferência: contagens e amostras comparadas com o backup.

## Mapeamento

### `config` → `business_settings` (linha única)

| Legado | Novo | Observação |
|---|---|---|
| `nome` | `name` | |
| `endereco` | `address_line` | |
| `bairro` | `neighborhood` | |
| `cidade` | `city` | |
| `cep` | `postal_code` | |
| `telefone` | `phone_display` | |
| `telefoneRaw` | `phone_e164` | |
| `whatsapp` | `whatsapp_number` | |
| `instagram` | `instagram_url` | |
| `canal` | `booking_channel` | `whatsapp` / `instagram` / `outro` |
| `canalOutro` | `booking_channel_url` | |
| `nota` | `rating_display` | texto, ex.: `5,0` |
| `avaliacoes` | `review_count` | |
| `senha` | — | **descartada**. Acesso passa a ser pelo Supabase Auth |
| campos desconhecidos | — | listados no relatório, não importados |

### `horarios` → `business_settings` + `business_hours`

| Legado | Novo |
|---|---|
| `livre`, `livreIni`, `livreFim` | `free_schedule`, `free_start`, `free_end` |
| `configurado` | `schedule_configured` |
| `intervalo` | `slot_interval_minutes` |
| `almoco.ativo/ini/fim` | `lunch_enabled`, `lunch_start`, `lunch_end` |
| `dias[i].aberto/ini/fim` | `business_hours` com `weekday = i` (0 = domingo) |

### `servicos` → `services`

| Legado | Novo | Observação |
|---|---|---|
| `id` (`s1`… ou aleatório) | `legacy_id` | `id` novo é UUID |
| `nome` | `name` | |
| `desc` | `description` | |
| `preco` número | `price_cents` | `40` → `4000` |
| `preco` texto | `price_label` | ex.: `Verificar com o Dhow` |
| `preco` null | ambos null | exibido como "Valor sob consulta" |
| `duracao` | `duration_minutes` | null = usa o intervalo da agenda |
| `ativo` | `active` | |
| posição no array | `sort_order` | |

### `bloqueios` → `blocked_dates`

| Legado | Novo |
|---|---|
| `id` | `legacy_id` |
| `dataIni` | `start_date` |
| `dataFim` (ou `dataIni` se vazio) | `end_date` |
| `diaTodo` | `all_day` |
| `ini`, `fim` | `start_time`, `end_time` |
| `motivo` | `reason` |

### `agendamentos` → `appointments`

| Legado | Novo | Observação |
|---|---|---|
| `id` | `legacy_id` | `id` novo é UUID |
| `codigo` | `public_code` | mantido como está (`DB-XXXX`), em maiúsculas |
| `cliente` | `customer_name` | |
| `telefone` | `customer_phone` | como digitado |
| `telDigits` | `customer_phone_digits` | normalizado (remove `55` inicial); inválidos vão para o relatório |
| `servicoId` | `service_id` | via `services.legacy_id`; sem correspondência → null |
| — | `service_name`, `price_cents`, `price_label` | cópia do serviço no backup; se não existir, `service_name = '-'` |
| `data` | `appointment_date` | |
| `hora` | `start_time` | |
| `hora` + `duracao` | `end_time` | `duracao` ausente → intervalo da agenda |
| `pagamento` | `payment_method` | valores fora de PIX/CARTÃO/DINHEIRO vão para o relatório |
| `obs` | `notes` | |
| `status` | `status` | mesmos 6 valores |
| `criadoEm` | `created_at` | |
| — | `source = 'legacy_import'` | |
| — | `access_token_hash = null` | cliente acessa com telefone + código |

**Sobreposições:** o legado permitia reabrir ou confirmar sem checar o horário. Se o backup tiver dois
agendamentos ativos no mesmo horário, a constraint recusa o segundo. A simulação lista esses pares para
decisão do barbeiro (por exemplo, marcar um como cancelado) — **nada é descartado automaticamente**.

### `portfolio` → `portfolio` (+ Storage)

| Legado | Novo | Observação |
|---|---|---|
| `id` | `legacy_id` | |
| `image` base64 (`data:image/...`) | `image_url` | enviado para um bucket público do Storage; grava-se a URL |
| `image` URL | `image_url` | mantida |
| `caption` | `caption` | |
| `instagramUrl` | `instagram_url` | |
| `ativo` | `active` | |
| posição no array | `sort_order` | |
| `portfolioRemovidas` | — | só servia para o legado não recriar fotos padrão |

As fotos padrão embutidas no código legado entram como itens normais quando estiverem no backup.

### `depoimentos` → `reviews`

| Legado | Novo |
|---|---|
| texto na posição `i` | `body`, `legacy_index = i`, `sort_order = i` |
| — | `author_name`, `rating` ficam null |

A nota geral e o total (`config.nota`, `config.avaliacoes`) vão para `business_settings`.

### Outros

| Legado | Destino |
|---|---|
| `dataVersion` | não importado (usado só para migrar antes) |
| `dhow_last_phone` (localStorage) | continua só no aparelho |
| `dhow_admin` (sessionStorage) | descartado; sessão passa a ser do Supabase Auth |
