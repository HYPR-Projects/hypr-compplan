# HYPR Commplan — Backend

Plataforma de cálculo automatizado de bônus dos Customer Success da HYPR.
Computa, por quarter, o percentual de bonificação de cada CS sobre a receita
líquida das campanhas que ele rodou — segundo as 30 regras do Compplan 2026.

## Stack

- **Node.js 20** + **Express 4** + **BigQuery**
- **Cloud Run** (southamerica-east1)
- **JWT HS256** com SSO compartilhado com Report Center (mesmo `JWT_SECRET`)
- **Google OAuth** restrito a `@hypr.mobi`

## Como funciona

1. CP cria PI no **HYPR Command** → grava em `hypr_sales_center.checklists`
2. Campanha roda no DV360 → métricas entram em `prod_assets.unified_*`
3. CS abre o **Commplan** → vê suas campanhas do quarter avaliadas em tempo real
4. CS submete claims manuais (audiências, pós-venda, etc.) via UI
5. Admin revisa claims → aprova/rejeita
6. Admin clica "Recalcular" → engine processa todas as campanhas
7. Admin aprova quarter → snapshot fica imutável + e-mails saem
8. Admin paga via folha → marca como `paid`

## Estrutura

```
.
├── index.js                # Entry point Express
├── lib/                    # Auth, BQ client, audit, email, version resolver
├── data/                   # Acesso a BQ (1 módulo por entidade)
├── engine/                 # Avaliador de regras
│   ├── index.js            # Orchestrator
│   ├── revenue.js          # Cálculo de receita líquida (× 0.8347)
│   ├── caps-and-exclusions.js  # cap_group + exclusion_group + setup invalidators
│   ├── quarter-resolver.js
│   └── evaluators/         # 1 arquivo por condition_kind
├── routes/
│   ├── auth.js             # POST /auth/login | refresh
│   ├── me.js               # CS vê próprio bônus
│   ├── evidences.js        # CS submete claims
│   └── admin/              # 7 routers admin (rules, quarter, salários, etc.)
├── middleware/auth.js      # authRequired, adminRequired, selfOrAdmin
├── sql/
│   ├── 01-schema.sql       # DDL das 10 tabelas
│   └── 02-seeds.sql        # versão 2026, 24 features, 30 regras, ABS clients, admins
├── scripts/setup-schema.js # Roda DDL + seeds programaticamente
└── deploy.sh               # Cloud Run deploy
```

## Setup local

```bash
cp .env.example .env
# Preenche JWT_SECRET (igual do Report Center), GOOGLE_OAUTH_CLIENT_ID, GOOGLE_APPLICATION_CREDENTIALS
npm install
npm run setup-schema      # cria tabelas + popula seeds + roda migrations (RODE 1× POR AMBIENTE)
npm run dev               # http://localhost:8080
```

Variantes do setup-schema:
- `node scripts/setup-schema.js --schema-only`     # só DDL
- `node scripts/setup-schema.js --seeds-only`      # só seeds
- `node scripts/setup-schema.js --migrations-only` # só altera tabelas existentes do Command

## Deploy

```bash
# Pré-requisitos no GCP:
#   - Service Account: commplan-runner@site-hypr.iam.gserviceaccount.com
#     com BigQuery Data Editor + BigQuery Job User
#   - Secrets: commplan-jwt-secret, commplan-google-oauth-id, commplan-email-pass
./deploy.sh
```

## Endpoints principais

### Autenticação
- `POST /auth/login` (Bearer = Google id_token) → `{ jwt, email, role }`

### CS-side (autenticado)
- `GET  /commplan/me/quarter/:q` — resumo do quarter
- `GET  /commplan/me/campaigns/:q` — lista campanhas com avaliação on-the-fly
- `GET  /commplan/me/history` — histórico de quarters
- `POST /commplan/evidences` — submeter claim
- `PUT  /commplan/evidences/:id` — editar claim (antes de aprovado)
- `DELETE /commplan/evidences/:id`
- `GET  /commplan/studies/available?version=2026` — lista estudos disponíveis (consumido pelo Command)

### Admin
- `POST /commplan/admin/quarter/:q/compute` — recalcula tudo
- `GET  /commplan/admin/quarter/:q` — lista snapshots
- `PUT  /commplan/admin/quarter/:q/:cs/approve` — aprova
- `PUT  /commplan/admin/quarter/:q/:cs/mark-paid` — marca pago
- `GET  /commplan/admin/evidences/pending`
- `PUT  /commplan/admin/evidences/:id/approve|reject`
- `GET|POST|PUT /commplan/admin/rules` — Caminho B: edição segura
- `GET|POST /commplan/admin/cs-config` — salários (close-and-insert)
- `GET|POST|PUT|DELETE /commplan/admin/team-members` — gestão de CSs e admins (cria CS completo: member + salário)
- `GET|POST|DELETE /commplan/admin/mentorships`
- `GET|POST|DELETE /commplan/admin/abs-clients`
- `GET|POST|PUT /commplan/admin/studies` — catálogo de estudos sazonais
- `GET /commplan/admin/audit?entity_type=...`

## Decisões de design

- **Read-mostly** dos sistemas existentes (Command, Report Center). Não modifica nada deles.
- **Versionamento anual.** Cada PDF do Compplan vira uma versão. Cálculo retroativo
  sempre usa a versão correta via `effective_from/to`.
- **Append-only.** Salários, mentorias e snapshots usam padrão close-and-insert. UPDATE
  apenas em campos não-críticos. Auditoria perfeita.
- **Caminho B (edição segura) de regras.** Admin pode mudar `bonus_pct`, ativar/desativar,
  reordenar. Mudanças estruturais (`condition_kind`, payload) exigem nova versão.
- **ABS dirigido por tabela.** `commplan_abs_clients` é a fonte de verdade. Lookup por
  `advertiser_id` em O(1) via Set em memória.
- **Cap groups + exclusion groups.** Pós-processadores aplicados em ordem:
  setup invalidators → exclusion → caps. Determinístico.

## Pendências antes do go-live

- [ ] Confirmar `advertiser_id` de JDE vs Kenvue (sql/02-seeds.sql tem placeholder)
- [ ] Adicionar Amazon Prime Video e Nestlé em `commplan_abs_clients`
- [ ] Confirmar onde "RMN Digital" e "RMN Físico" aparecem no Command — hoje as regras `setup_media_rmn_digital_2026` e `setup_media_rmn_fisico_2026` buscam no campo `products`. Validar se vem de outro campo do checklist.
- [ ] Atualizar Command pra renderizar chips de estudos disponíveis (consumindo `GET /commplan/studies/available`) e persistir `studies_used` no checklist
- [ ] Definir salário fixo dos 6 CSs via UI (`POST /commplan/admin/cs-config` ou tela do admin)
- [ ] Validar `JWT_SECRET` igual ao do Report Center em produção
- [ ] Criar Service Account `commplan-runner` no GCP com perms de BQ
- [ ] Provisionar secrets no Secret Manager
- [ ] Deploy de frontend em `commplan.hypr.mobi`
