# Dhow Barber — Sistema de agendamento e gestão

Sistema completo de agendamento (área pública + área do cliente + painel do barbeiro) em **um único arquivo**: `index.html`.
Sem build, sem dependências, sem servidor. Abra e use.

---

## 1. Como executar

**Local:** dê dois cliques em `index.html`. Funciona em qualquer navegador atualizado.

**Servindo por HTTP** (recomendado para testar no celular na mesma rede):

```bash
cd pasta-do-projeto
python3 -m http.server 8080
# acesse http://localhost:8080  ou  http://SEU-IP:8080
```

## 2. Como publicar

Como é um arquivo estático, qualquer hospedagem serve — todas gratuitas:

| Serviço | Como fazer |
|---|---|
| **Netlify Drop** | arraste a pasta em app.netlify.com/drop |
| **Vercel** | `npx vercel --prod` dentro da pasta |
| **GitHub Pages** | suba o arquivo no repositório → Settings → Pages |
| **Hostinger / cPanel** | envie `index.html` para `public_html` |

Depois é só apontar o domínio (ex.: `dhowbarber.com.br`) e colocar o link na bio do Instagram.

---

## 3. Acessar o painel do barbeiro

Endereço: **`seusite.com/#/admin`**
Senha inicial: **`dhow2026`**

> Troque a senha em **Configurações → Acesso ao painel**, logo no primeiro acesso.

O cliente nunca chega ao painel navegando pelo site: o link fica só no rodapé e exige senha.

---

## 4. Primeiros passos (o painel te guia)

O dashboard mostra uma lista de pendências. Enquanto ela não estiver zerada, o site não exibe preço nem datas — **nada foi inventado**, tudo vem do que você cadastrar.

1. **Horários** → ligue os dias em que atende, defina abertura, fechamento, intervalo entre horários e almoço → *Salvar horários*. Só depois disso a agenda abre para os clientes.
2. **Serviços** → toque em *Editar* em cada um e preencha **preço** e **duração em minutos**. A duração é o que calcula os encaixes da agenda.
3. **Configurações** → confira endereço, WhatsApp e Instagram, e troque a senha.
4. **Portfólio** → adicione mais fotos (as 3 que você mandou já estão lá).

## 5. Como funciona a agenda

- Os horários livres são **gerados automaticamente**: dia aberto → abertura até fechamento, de X em X minutos, menos almoço, menos bloqueios, menos horários já ocupados.
- A duração do serviço é respeitada: se alguém marcou corte de 1h às 14:00, ninguém consegue pegar 13:30 nem 14:00.
- Horário de hoje que já passou (ou falta menos de 15 min) não aparece.
- **Bloqueios** fecham um horário, um dia inteiro ou um período (férias, feriado, compromisso pessoal).

## 6. Gerenciar agendamentos

Toda solicitação entra como **Pendente**. Tocando nela você pode:

**Confirmar** · **Pedir reagendamento** · **Recusar** → depois **Concluir** ou **Cancelar**.

Também dá para abrir o WhatsApp do cliente direto pelo detalhe do agendamento.
A agenda tem visão de **dia, semana e mês**, e a aba **Clientes** monta sozinha o histórico de quem já agendou.

## 7. Como as solicitações chegam até você

Em **Configurações → Canal de recebimento** você escolhe:

- **WhatsApp** (padrão) — abre a conversa com a mensagem já preenchida. Um toque e o cliente envia.
- **Instagram** — abre o perfil `@dhowbarber_` com a mensagem copiada, para o cliente colar na DM.
- **Outro link** — qualquer canal que você usar depois.

> **Sobre o Instagram:** um site não consegue enviar DM sozinho sem a API oficial da Meta (Instagram Messaging API, que exige conta profissional, app aprovado e servidor). O sistema não finge que envia: ele monta a mensagem, copia e abre a conversa. A função `canalDestino()` no código já está isolada para receber essa integração no futuro sem mexer no resto.

## 8. Onde ficam os dados

Os dados são gravados no **navegador** (localStorage). Isso significa:

- funciona offline e sem custo nenhum;
- cada dispositivo tem sua própria cópia — o agendamento feito no celular do cliente não aparece no seu painel automaticamente. **É por isso que a mensagem por WhatsApp é o canal oficial de recebimento.**

Em **Configurações** existe **Exportar backup** e **Importar backup** (`.json`) para levar os dados de um aparelho para outro.

### Quando migrar para banco de dados real

Quando quiser que o agendamento do cliente caia direto no seu painel, sem mensagem, o passo é trocar a camada `Store` (umas 15 linhas no início do script) por Supabase:

```bash
npm create vite@latest dhow -- --template react
npm i @supabase/supabase-js
```

`.env`:
```
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

Tabelas sugeridas — os campos são exatamente os que o sistema já usa:

```sql
create table servicos      (id uuid primary key default gen_random_uuid(), nome text, descricao text, preco numeric, duracao int, ativo bool default true);
create table agendamentos  (id uuid primary key default gen_random_uuid(), codigo text, cliente text, telefone text, servico_id uuid references servicos, data date, hora time, duracao int, pagamento text, obs text, status text default 'pendente', criado_em timestamptz default now());
create table bloqueios     (id uuid primary key default gen_random_uuid(), data_ini date, data_fim date, dia_todo bool, ini time, fim time, motivo text);
create table portfolio     (id uuid primary key default gen_random_uuid(), image text, caption text, instagram_url text, ativo bool default true, ordem int);
create table configuracoes (id int primary key default 1, dados jsonb);
```

Com Supabase, a autenticação do painel também passa a ser real (Supabase Auth). **A senha atual protege a interface, não o dado** — para uso profissional com dados de clientes, faça essa migração.

---

## 9. Identidade visual

Tudo foi tirado da logo:

| | |
|---|---|
| Preto quente `#14120E` | anel da logo |
| Creme `#FBF6E7` | fundo do medalhão |
| Verde folha `#646755` / `#8E9A7C` | oliveira e acácia |
| Laranja `#E07B1E` | cabo do pincel — usado só em ação e destaque |

As folhas e ramos que aparecem pelo site são **desenhados em SVG** (função `branch()`), não recortes da imagem: aparecem em tamanhos, ângulos e opacidades diferentes no hero, nos divisores, no portfólio, na agenda e no rodapé.
Tipografia: **Cormorant** (títulos, ar de assinatura) + **Jost** (interface).

## 10. Estrutura do código

```
index.html
├── CSS      tokens da marca → componentes públicos → agendamento → painel (tema escuro)
└── JS
    ├── Ícones e ramos SVG
    ├── Store          persistência (troque isso pelo Supabase)
    ├── seed()         dados iniciais — sem preço, sem horário inventado
    ├── slotsDisponiveis()  motor da agenda
    ├── montarMensagem() / canalDestino()   envio da solicitação
    ├── Área pública, carrossel, lightbox
    ├── Fluxo de agendamento em 6 etapas
    ├── Meus agendamentos (busca por telefone)
    └── Painel: dashboard, agenda, agendamentos, serviços, horários, bloqueios, clientes, portfólio, configurações
```

---

Feito por Gustavo.
